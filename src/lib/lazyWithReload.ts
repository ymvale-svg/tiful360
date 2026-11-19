import { lazy, type ComponentType } from "react";

const KEY = "lazy-reload-at";
const WINDOW_MS = 30_000;
let reloading = false;

/**
 * Reload the page to pick up a fresh build after a chunk failed to load, at most once per
 * 30 seconds per tab. Returns true when a reload is under way (or already was), false when one
 * was tried too recently — the caller must then let the error surface instead of hiding it.
 */
export function reloadOnceForStaleChunk(): boolean {
  if (reloading) return true;
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last <= WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // storage unavailable: no loop guard, so never auto-reload
  }
  reloading = true;
  window.location.reload();
  return true;
}

/**
 * React.lazy that survives a stale deploy: if a chunk fails to load or
 * resolves without a default export (old cached chunk), reload the page once.
 * Otherwise the error is thrown so RouteErrorBoundary shows a message.
 */
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      if (!mod || !mod.default) throw new Error("chunk missing default export");
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      if (reloadOnceForStaleChunk()) return new Promise<{ default: T }>(() => {});
      throw err;
    }
  });
}
