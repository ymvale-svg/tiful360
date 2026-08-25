import { useCallback, useEffect, useState } from "react";

/**
 * State persisted per-key in sessionStorage, so returning to a list screen
 * (after opening an item / employee card) restores the last used filters.
 * Cleared only when the user resets the filter himself.
 */
export function usePersistentFilter<T>(key: string, initial: T) {
  const storageKey = `filter:${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* ignore */
    }
    return initial;
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [storageKey, value]);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [value, setValue, reset] as const;
}
