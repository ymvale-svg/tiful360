import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/** The inventory category whose items act as storage containers on a site. */
export const CONTAINER_CATEGORY_NAME = "משרדים יבילים";

export interface SiteContainer {
  id: string;
  company_id: string;
  site_id: string | null;
  name: string;
  is_active: boolean;
}

/**
 * Containers are real inventory items from the "משרדים יבילים" category.
 * For a given site we return the portable offices already placed on that site,
 * plus unassigned ones still in stock (so they can be placed).
 */
export function useSiteContainers(siteId?: string | null) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["site-containers", activeCompanyId, siteId ?? "all"],
    queryFn: async (): Promise<SiteContainer[]> => {
      let catQuery = supabase
        .from("asset_categories")
        .select("id")
        .eq("category_name", CONTAINER_CATEGORY_NAME);
      if (activeCompanyId) catQuery = catQuery.eq("company_id", activeCompanyId);
      const { data: cats, error: catErr } = await catQuery;
      if (catErr) throw catErr;
      const catIds = (cats ?? []).map((c: any) => c.id);
      if (catIds.length === 0) return [];

      let query = supabase
        .from("assets")
        .select("id, company_id, asset_name, asset_code, assigned_site_id, status")
        .in("category_id", catIds)
        .order("asset_code");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;

      const rows = (data ?? []) as any[];
      const relevant = siteId
        ? rows.filter((a) => a.assigned_site_id === siteId || !a.assigned_site_id)
        : rows;

      return relevant.map((a) => ({
        id: a.id,
        company_id: a.company_id,
        site_id: a.assigned_site_id ?? null,
        name: a.asset_code ? `${a.asset_name} (${a.asset_code})` : a.asset_name,
        is_active: true,
      }));
    },
  });
}
