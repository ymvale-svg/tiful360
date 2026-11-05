import { lazy, type ComponentType } from "react";

const KEY = "lazy-reload-at";

/**
 * React.lazy that survives a stale deploy: if a chunk fails to load or
 * resolves without a default export (old cached chunk), reload the page once.
 */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      if (!mod || !mod.default) throw new Error("chunk missing default export");
      sessionStorage.removeItem(KEY);
      return mod;
    } catch (err) {
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
