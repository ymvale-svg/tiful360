import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      employee_code: string;
      full_name: string;
      id_number: string;
      role: string;
      department: string;
      phone?: string;
      email?: string;
      start_date?: string;
      birth_date?: string;
      status?: "active" | "onboarding";
      direct_manager_id?: string | null;
      sub_employer_id?: string | null;
      exclude_from_contacts?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("employees")
        .insert({ ...params, company_id: activeCompanyId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      asset_code: string;
      asset_name: string;
      category_id: string;
      serial_number?: string;
      current_owner_id?: string;
      status?: "in_use" | "in_stock" | "in_repair";
      custom_fields?: Record<string, any>;
      expiry_date?: string;
      notes?: string;
      manufacturer_model?: string;
      condition?: string;
    }) => {
      const { data, error } = await supabase
        .from("assets")
        .insert({ ...params, company_id: activeCompanyId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["employee-assets"] });
    },
  });
}

export function useTransferAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assetId, newOwnerId, assetName, fromName, toName }: {
      assetId: string;
      newOwnerId: string | null;
      assetName: string;
      fromName: string;
      toName: string;
    }) => {
      const { error } = await supabase
        .from("assets")
        .update({
          current_owner_id: newOwnerId,
          status: newOwnerId ? "in_use" : "in_stock",
        })
        .eq("id", assetId);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("activity_log").insert({
        action: `העברת בעלות: ${assetName}`,
        details: `מ-${fromName} אל ${toName}`,
        entity_type: "asset",
        entity_id: assetId,
        performed_by: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["employee-assets"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, any>) => {
      const { error } = await (supabase.from("assets") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["employee-assets"] });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, any>) => {
      const { error } = await (supabase.from("employees") as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee", vars.id] });
    },
  });
}

// useUpsertDigitalAccess and useDeleteDigitalAccess removed -
// digital access is now managed via the assets table (DACC category).
// Use useUpsertAsset / useDeleteAsset (if available) or direct supabase calls.

export function useUnassignAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (assetId: string) => {
      const { error } = await supabase
        .from("assets")
        .update({ current_owner_id: null, status: "in_stock" })
        .eq("id", assetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["employee-assets"] });
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
