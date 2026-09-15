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
  default_owner_role: string | null;
  is_vehicle_related?: boolean | null;
  visible_builtin_fields?: string[] | null;
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
    mutationFn: async (params: { category_id: string; name: string; description?: string | null; default_owner_role?: string | null; company_id?: string | null }) => {
      const companyId = params.company_id ?? activeCompanyId;
      if (!companyId) throw new Error("לא נבחרה חברה פעילה");
      const { data, error } = await supabase
        .from("asset_groups")
        .insert({ ...params, company_id: companyId } as any)
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
    mutationFn: async ({ id, ...params }: { id: string; name?: string; description?: string | null; sort_order?: number; default_owner_role?: string | null; visible_builtin_fields?: string[] | null }) => {
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
      // Unlink dependants first so the delete never trips a foreign key.
      await supabase.from("assets").update({ group_id: null } as any).eq("group_id", id);
      await supabase.from("category_fields").update({ group_id: null } as any).eq("group_id", id);
      await supabase.from("onboarding_items").update({ selected_group_id: null } as any).eq("selected_group_id", id);
      await supabase.from("asset_handover_forms").update({ group_id: null } as any).eq("group_id", id);
      const { error } = await supabase.from("asset_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-groups"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["category-fields"] });
    },
  });
}


/**
 * Moves a sub-category to another category (possibly in a different domain),
 * taking its items and field definitions along. Asset codes are never touched,
 * so an existing prefix such as ACC stays exactly as it is.
 */
export function useMoveAssetGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, categoryId }: { groupId: string; categoryId: string }) => {
      const { error } = await supabase
        .from("asset_groups")
        .update({ category_id: categoryId } as any)
        .eq("id", groupId);
      if (error) throw error;

      const { error: assetsError } = await supabase
        .from("assets")
        .update({ category_id: categoryId } as any)
        .eq("group_id", groupId);
      if (assetsError) throw assetsError;

      const { error: fieldsError } = await supabase
        .from("category_fields")
        .update({ category_id: categoryId } as any)
        .eq("group_id", groupId);
      if (fieldsError) throw fieldsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["asset-groups"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["category-fields"] });
      qc.invalidateQueries({ queryKey: ["asset-categories"] });
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
