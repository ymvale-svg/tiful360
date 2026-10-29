import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACCESS_DOMAINS, type AccessAsset } from "@/lib/portalApps";

/** The company's system catalogue (portal_links), shared by the portal launcher and its settings. */
export function useCompanyPortalLinks(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal_links", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_links")
        .select("*")
        .eq("company_id", companyId!)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Digital-access and licence assets held by one employee: the source of "assigned" systems. */
export function useMyAccessAssets(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ["my_access_assets", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<AccessAsset[]> => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, asset_name, category_id, group_id, status, account_url, account_username, password_expires_at, license_expires_at, asset_categories!inner(category_name, domain)")
        .eq("current_owner_id", employeeId!)
        .in("asset_categories.domain", [...ACCESS_DOMAINS]);
      if (error) throw error;
      return (data ?? []).map(({ asset_categories, ...a }) => ({ ...a, category_name: asset_categories?.category_name ?? null }));
    },
  });
}

const favoritesKey = (userId: string | null | undefined) => ["portal_app_favorites", userId];

export function useLauncherFavorites(userId: string | null | undefined) {
  return useQuery({
    queryKey: favoritesKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("portal_app_favorites").select("item_key");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.item_key));
    },
  });
}

/** Adds or removes a favourite, updating the list at once and rolling back if the save fails. */
export function useToggleLauncherFavorite(userId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, favorite }: { key: string; favorite: boolean }) => {
      const { error } = favorite
        ? await supabase.from("portal_app_favorites").upsert({ item_key: key }, { onConflict: "user_id,item_key", ignoreDuplicates: true })
        : await supabase.from("portal_app_favorites").delete().eq("item_key", key);
      if (error) throw error;
    },
    onMutate: async ({ key, favorite }) => {
      await qc.cancelQueries({ queryKey: favoritesKey(userId) });
      const previous = qc.getQueryData<Set<string>>(favoritesKey(userId));
      const next = new Set(previous ?? []);
      if (favorite) next.add(key);
      else next.delete(key);
      qc.setQueryData(favoritesKey(userId), next);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(favoritesKey(userId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: favoritesKey(userId) }),
  });
}
