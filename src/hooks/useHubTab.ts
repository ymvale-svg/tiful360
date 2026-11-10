import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { allowedTabs, resolveTab, type HubKey, type HubTab } from "@/lib/screenAccess";

/**
 * Active tab of a hub screen, kept in ?tab= so reloads, shared links and Back keep it.
 * Only tabs the user's roles allow are returned; an unknown or forbidden ?tab= falls back
 * to the first allowed tab. Switching tabs drops the previous tab's own query params.
 */
export function useHubTab(hub: HubKey): {
  tabs: HubTab[];
  active: string | null;
  setActive: (key: string) => void;
  showTabBar: boolean;
} {
  const { roles, isSuperAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = useMemo(() => allowedTabs(hub, roles, isSuperAdmin), [hub, roles, isSuperAdmin]);
  const active = resolveTab(tabs, searchParams.get("tab"));

  const setActive = useCallback(
    (key: string) => {
      setSearchParams(key === tabs[0]?.key ? {} : { tab: key }, { replace: true });
    },
    [setSearchParams, tabs],
  );

  return { tabs, active, setActive, showTabBar: tabs.length > 1 };
}
