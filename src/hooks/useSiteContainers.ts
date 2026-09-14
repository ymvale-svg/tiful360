import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface SiteContainer {
  id: string;
  company_id: string;
  site_id: string;
  name: string;
  is_active: boolean;
}

export function useSiteContainers(siteId?: string | null) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["site-containers", activeCompanyId, siteId ?? "all"],
    queryFn: async (): Promise<SiteContainer[]> => {
      let query = supabase.from("site_containers" as any).select("*").order("name");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      if (siteId) query = query.eq("site_id", siteId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as SiteContainer[];
    },
  });
}

export function useCreateSiteContainer() {
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { site_id: string; name: string }): Promise<SiteContainer> => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("site_containers" as any)
        .insert({
          company_id: activeCompanyId,
          site_id: values.site_id,
          name: values.name.trim(),
          created_by: user?.id ?? null,
        } as any)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as SiteContainer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site-containers"] });
    },
  });
}
