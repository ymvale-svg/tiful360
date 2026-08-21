import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/** A concrete model/variant under a sub-category (e.g. car models under "ליסינג"). */
export type AssetGroupModel = {
  id: string;
  company_id: string;
  group_id: string;
  name: string;
  manufacturer: string | null;
  notes: string | null;
  is_active: boolean;
  sort_order: number;
};

export function useAssetGroupModels() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["asset-group-models", activeCompanyId],
    queryFn: async () => {
      let q = supabase
        .from("asset_group_models" as any)
        .select("*")
        .order("sort_order")
        .order("name");
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as AssetGroupModel[];
    },
  });
}

export function useCreateAssetGroupModel() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      group_id: string;
      name: string;
      manufacturer?: string | null;
      notes?: string | null;
    }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה פעילה");
      const { data, error } = await supabase
        .from("asset_group_models" as any)
        .insert({ ...params, company_id: activeCompanyId } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as AssetGroupModel;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-group-models"] }),
  });
}

export function useUpdateAssetGroupModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; manufacturer?: string | null; notes?: string | null; is_active?: boolean; sort_order?: number }) => {
      const { error } = await supabase.from("asset_group_models" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-group-models"] }),
  });
}

export function useDeleteAssetGroupModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("asset_group_models" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset-group-models"] }),
  });
}
