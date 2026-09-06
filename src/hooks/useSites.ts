import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string | null;
  contact_name: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}

export function useSites() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["sites", activeCompanyId],
    queryFn: async (): Promise<Site[]> => {
      let query = supabase.from("sites").select("*").order("name");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Site[];
    },
  });
}

export function useCreateSite() {
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      address?: string | null;
      contact_name?: string | null;
      phone?: string | null;
      notes?: string | null;
    }): Promise<Site> => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("sites")
        .insert({
          company_id: activeCompanyId,
          name: values.name.trim(),
          address: values.address?.trim() || null,
          contact_name: values.contact_name?.trim() || null,
          phone: values.phone?.trim() || null,
          notes: values.notes?.trim() || null,
          created_by: user?.id ?? null,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as Site;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
}
