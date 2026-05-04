import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface AssetDocument {
  id: string;
  asset_id: string;
  company_id: string;
  document_type: string;
  document_label: string | null;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  expiry_date: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  notes: string | null;
}

export const DOCUMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "insurance_certificate", label: "אישור ביטוח" },
  { value: "signed_license", label: "רישיון חתום" },
  { value: "contract", label: "חוזה" },
  { value: "invoice", label: "חשבונית" },
  { value: "certificate", label: "אישור / תעודה" },
  { value: "other", label: "אחר" },
];

export function useAssetDocuments(assetId: string | undefined) {
  return useQuery({
    queryKey: ["asset-documents", assetId],
    enabled: !!assetId,
    queryFn: async (): Promise<AssetDocument[]> => {
      const { data, error } = await supabase
        .from("asset_documents" as any)
        .select("*")
        .eq("asset_id", assetId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AssetDocument[];
    },
  });
}

export function useUploadAssetDocument() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      asset_id: string;
      file: File;
      document_type: string;
      document_label?: string;
      expiry_date?: string;
      notes?: string;
    }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const ext = params.file.name.split(".").pop() || "bin";
      // Storage keys must be ASCII-safe — strip Hebrew/unicode from the path key
      const path = `${activeCompanyId}/${params.asset_id}/${Date.now()}.${ext}`;

      const up = await supabase.storage.from("asset-documents").upload(path, params.file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (up.error) throw up.error;

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("asset_documents" as any).insert({
        asset_id: params.asset_id,
        company_id: activeCompanyId,
        document_type: params.document_type,
        document_label: params.document_label || null,
        file_url: path,
        file_name: params.file.name,
        file_size_bytes: params.file.size,
        expiry_date: params.expiry_date || null,
        notes: params.notes || null,
        uploaded_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["asset-documents", vars.asset_id] });
      qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    },
  });
}

export function useDeleteAssetDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: AssetDocument) => {
      // delete storage object (best-effort)
      await supabase.storage.from("asset-documents").remove([doc.file_url]);
      const { error } = await supabase.from("asset_documents" as any).delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: (_, doc) => {
      qc.invalidateQueries({ queryKey: ["asset-documents", doc.asset_id] });
      qc.invalidateQueries({ queryKey: ["expiring-assets"] });
    },
  });
}

export async function getAssetDocumentSignedUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("asset-documents")
    .createSignedUrl(filePath, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
