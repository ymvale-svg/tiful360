import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ResourceHistoryEntry {
  assetId: string | null;
  assetName: string;
  assetCode: string;
  category: string;
  domain: string | null;
  assignedAt: string | null;
  releasedAt: string | null;
  stillAssigned: boolean;
}

/**
 * Full log of resources (assets / digital accounts) ever linked to an employee:
 * when they were handed over and when they were released (if before offboarding).
 */
export function useEmployeeResourceHistory(employeeId?: string, snapshotAssets?: any[], revokedAt?: string | null) {
  return useQuery({
    queryKey: ["employee-resource-history", employeeId, revokedAt],
    enabled: !!employeeId,
    queryFn: async (): Promise<ResourceHistoryEntry[]> => {
      const [current, signedDocs, handovers] = await Promise.all([
        supabase
          .from("assets")
          .select("id, asset_name, asset_code, updated_at, created_at, category:asset_categories(category_name, domain)")
          .eq("current_owner_id", employeeId!),
        supabase
          .from("signed_documents")
          .select("asset_id, issued_at, returned_at, protocol_type")
          .eq("employee_id", employeeId!),
        supabase
          .from("asset_handover_forms")
          .select("asset_id, created_at, signed_at, protocol_type")
          .eq("employee_id", employeeId!),
      ]);

      const map = new Map<string, ResourceHistoryEntry>();
      const keyFor = (id: string | null, name: string) => id ?? `name:${name}`;

      const upsert = (e: Partial<ResourceHistoryEntry> & { assetId: string | null; assetName: string }) => {
        const k = keyFor(e.assetId, e.assetName);
        const prev = map.get(k);
        const merged: ResourceHistoryEntry = {
          assetId: e.assetId,
          assetName: e.assetName || prev?.assetName || "—",
          assetCode: e.assetCode || prev?.assetCode || "",
          category: e.category || prev?.category || "",
          domain: e.domain ?? prev?.domain ?? null,
          assignedAt:
            [prev?.assignedAt, e.assignedAt].filter(Boolean).sort()[0] ?? null,
          releasedAt:
            [prev?.releasedAt, e.releasedAt].filter(Boolean).sort().slice(-1)[0] ?? null,
          stillAssigned: e.stillAssigned ?? prev?.stillAssigned ?? false,
        };
        map.set(k, merged);
      };

      for (const a of current.data ?? []) {
        const cat: any = (a as any).category;
        upsert({
          assetId: a.id,
          assetName: a.asset_name,
          assetCode: a.asset_code,
          category: cat?.category_name ?? "",
          domain: cat?.domain ?? null,
          assignedAt: null,
          stillAssigned: true,
        });
      }

      // Enrich with names for assets referenced only by history rows
      const historyAssetIds = new Set<string>();
      for (const d of signedDocs.data ?? []) if (d.asset_id) historyAssetIds.add(d.asset_id);
      for (const h of handovers.data ?? []) if (h.asset_id) historyAssetIds.add(h.asset_id);
      for (const id of Array.from(map.keys())) historyAssetIds.delete(id);

      let extra: Record<string, any> = {};
      if (historyAssetIds.size > 0) {
        const { data } = await supabase
          .from("assets")
          .select("id, asset_name, asset_code, category:asset_categories(category_name, domain)")
          .in("id", Array.from(historyAssetIds));
        for (const a of data ?? []) extra[a.id] = a;
      }

      const meta = (assetId: string | null) => {
        const a = assetId ? extra[assetId] : null;
        return {
          assetName: a?.asset_name ?? "",
          assetCode: a?.asset_code ?? "",
          category: a?.category?.category_name ?? "",
          domain: a?.category?.domain ?? null,
        };
      };

      for (const h of handovers.data ?? []) {
        const m = meta(h.asset_id);
        upsert({ assetId: h.asset_id, ...m, assignedAt: h.signed_at ?? h.created_at });
      }
      for (const d of signedDocs.data ?? []) {
        const m = meta(d.asset_id);
        upsert({ assetId: d.asset_id, ...m, assignedAt: d.issued_at, releasedAt: d.returned_at });
      }

      // Offboarding snapshot: disconnected at offboarding time
      for (const s of snapshotAssets ?? []) {
        upsert({
          assetId: s.asset_id ?? s.id ?? null,
          assetName: s.asset_name ?? "—",
          assetCode: s.asset_code ?? "",
          category: s.category ?? "",
          domain: s.domain ?? null,
          releasedAt: revokedAt ?? null,
          stillAssigned: false,
        });
      }

      return Array.from(map.values()).sort((a, b) => (a.assignedAt ?? "").localeCompare(b.assignedAt ?? ""));
    },
  });
}
