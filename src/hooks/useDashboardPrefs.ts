import { useCallback, useEffect, useState } from "react";
import type { WidgetKey } from "@/lib/dashboardConfig";

export interface DashboardPrefs {
  hidden: WidgetKey[];
  wide: WidgetKey[];
}

const EMPTY: DashboardPrefs = { hidden: [], wide: [] };

function storageKey(userId?: string) {
  return `dashboard-prefs-${userId ?? "anon"}`;
}

function load(userId?: string): DashboardPrefs {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      wide: Array.isArray(parsed.wide) ? parsed.wide : [],
    };
  } catch {
    return EMPTY;
  }
}

/** Per-user dashboard layout preferences (hidden widgets + wide widgets), stored locally. */
export function useDashboardPrefs(userId?: string) {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => load(userId));

  useEffect(() => {
    setPrefs(load(userId));
  }, [userId]);

  const save = useCallback(
    (next: DashboardPrefs) => {
      setPrefs(next);
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
      } catch {
        /* storage full/blocked — prefs stay in memory for the session */
      }
    },
    [userId],
  );

  const toggleHidden = useCallback(
    (key: WidgetKey) => {
      const hidden = prefs.hidden.includes(key)
        ? prefs.hidden.filter((k) => k !== key)
        : [...prefs.hidden, key];
      // Un-hiding keeps the width; hiding a wide widget drops the wide flag.
      const wide = hidden.includes(key) ? prefs.wide.filter((k) => k !== key) : prefs.wide;
      save({ hidden, wide });
    },
    [prefs, save],
  );

  const toggleWide = useCallback(
    (key: WidgetKey) => {
      const wide = prefs.wide.includes(key)
        ? prefs.wide.filter((k) => k !== key)
        : [...prefs.wide, key];
      save({ ...prefs, wide });
    },
    [prefs, save],
  );

  const reset = useCallback(() => save(EMPTY), [save]);

  return { prefs, toggleHidden, toggleWide, reset, isCustomized: prefs.hidden.length > 0 || prefs.wide.length > 0 };
}
