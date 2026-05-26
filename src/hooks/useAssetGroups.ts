import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type AssetGroup = {
  id: string;
  company_id: string;
  category_id: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export function useAssetGroups() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["asset-groups", activeCompanyId],
    queryFn: async () => {
      let q = supabase.from("asset_groups").select("*").order("sort_order").order("name");
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AssetGroup[];
    },
  });
}

export function useCreateAssetGroup() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: { category_id: string; name: string; description?: string | null }) => {
      const { data, error } = await supabase
        .from("asset_groups")
        .insert({ ...params, company_id: activeCompanyId } as any)
        .select()
        .single();
      if (error) throw error;
      return data as AssetGroup;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-groups"] }),
  });
}

export function useUpdateAssetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...params }: { id: string; name?: string; description?: string | null; sort_order?: number }) => {
      const { error } = await supabase.from("asset_groups").update(params as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-groups"] }),
  });
}

export function useDeleteAssetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Unlink any assets first (group_id has ON DELETE SET NULL but be explicit)
      await supabase.from("assets").update({ group_id: null } as any).eq("group_id", id);
      const { error } = await supabase.from("asset_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-groups"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
}

export function useAssignAssetsToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, assetIds }: { groupId: string | null; assetIds: string[] }) => {
      if (assetIds.length === 0) return;
      const { error } = await supabase
        .from("assets")
        .update({ group_id: groupId } as any)
        .in("id", assetIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-groups"] });
    },
  });
}
