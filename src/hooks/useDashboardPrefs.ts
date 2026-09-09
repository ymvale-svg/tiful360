import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { WidgetKey } from "@/lib/dashboardConfig";

export interface DashboardPrefs {
  hidden: WidgetKey[];
  wide: WidgetKey[];
  /** User-defined widget order; widgets missing here keep their default position. */
  order: WidgetKey[];
}

const EMPTY: DashboardPrefs = { hidden: [], wide: [], order: [] };

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
      order: Array.isArray(parsed.order) ? parsed.order : [],
    };
  } catch {
    return EMPTY;
  }
}

function writeLocal(userId: string | undefined, next: DashboardPrefs) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* storage full/blocked — prefs stay in memory for the session */
  }
}

/** Sort the role's widgets by the user's saved order; unknown keys keep default order. */
export function applyWidgetOrder(widgets: WidgetKey[], order: WidgetKey[]): WidgetKey[] {
  if (order.length === 0) return widgets;
  return [...widgets].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return widgets.indexOf(a) - widgets.indexOf(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

/**
 * Per-user dashboard layout preferences (hidden widgets, wide widgets, order).
 * Stored on the server so they follow the user across devices/browsers,
 * with a local copy for instant rendering.
 */
export function useDashboardPrefs(userId?: string) {
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => load(userId));
  const loadedFor = useRef<string | undefined>(undefined);

  // Load the saved layout for this user (local first, then server).
  useEffect(() => {
    if (!userId) return;
    const local = load(userId);
    setPrefs(local);
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("user_dashboard_prefs")
        .select("hidden, wide, order")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled || error) return;

      if (data) {
        const remote: DashboardPrefs = {
          hidden: (data.hidden ?? []) as WidgetKey[],
          wide: (data.wide ?? []) as WidgetKey[],
          order: ((data as { order?: string[] }).order ?? []) as WidgetKey[],
        };
        setPrefs(remote);
        writeLocal(userId, remote);
      } else if (local.hidden.length > 0 || local.wide.length > 0 || local.order.length > 0) {
        // First run after the server-side store was added: keep what the user already set.
        await supabase.from("user_dashboard_prefs").upsert({ user_id: userId, ...local });
      }
      loadedFor.current = userId;
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const save = useCallback(
    (next: DashboardPrefs) => {
      setPrefs(next);
      writeLocal(userId, next);
      if (userId) {
        // NOTE: the query builder is lazy — it must be awaited/then-ed to actually run.
        void (async () => {
          const { error } = await supabase
            .from("user_dashboard_prefs")
            .upsert(
              {
                user_id: userId,
                hidden: next.hidden,
                wide: next.wide,
                order: next.order,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            );
          if (error) console.error("Failed to save dashboard prefs", error);
        })();
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
      save({ ...prefs, hidden, wide });
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

  /** Persist a full ordering (already computed by the UI). */
  const setOrder = useCallback(
    (order: WidgetKey[]) => save({ ...prefs, order }),
    [prefs, save],
  );

  const reset = useCallback(() => save(EMPTY), [save]);

  return {
    prefs,
    toggleHidden,
    toggleWide,
    setOrder,
    reset,
    isCustomized: prefs.hidden.length > 0 || prefs.wide.length > 0 || prefs.order.length > 0,
  };
}
