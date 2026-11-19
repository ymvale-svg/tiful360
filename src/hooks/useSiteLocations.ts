import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Locations already used on a site, offered as suggestions so the same spot is spelled the same way. */
export function useSiteLocations(siteId: string | null | undefined) {
  return useQuery({
    queryKey: ["site-locations", siteId ?? ""],
    enabled: !!siteId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("assets")
        .select("site_location")
        .eq("assigned_site_id", siteId!)
        .not("site_location", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data ?? []) as Array<{ site_location: string | null }>) {
        const v = row.site_location?.trim();
        if (v) set.add(v);
      }
      return [...set].sort((a, b) => a.localeCompare(b, "he"));
    },
  });
}
