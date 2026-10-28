import { useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { RefreshCw } from "lucide-react";

/**
 * Registers the service worker and offers an update instead of applying one
 * silently.
 *
 * Navigations already come from the network, so a publish is visible on the
 * next page load. This covers the other case: a tab left open for hours or
 * days, which keeps running the JavaScript it started with no matter what the
 * worker does underneath it. `clientsClaim` hands the new worker control of
 * that tab, but nothing re-renders it — only a reload does.
 */
export function PwaUpdatePrompt() {
  const [updateReady, setUpdateReady] = useState(false);
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Store the callback itself, not its result — a bare function passed to
        // setState would be treated as an updater and called immediately.
        setApply(() => () => updateSW(true));
        setUpdateReady(true);
      },
    });

    // A deploy removes the previous hashed chunks. A tab holding the old
    // index.html asks for one of them on its next lazy route and gets a 404,
    // which surfaces as a blank screen rather than an error the user can act on.
    // Reload once — the fresh HTML points at chunks that exist.
    const RELOAD_FLAG = "pwa_chunk_reload";
    const onPreloadError = (e: Event) => {
      e.preventDefault();
      if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried; let it fail visibly
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    // A successful load means we are on a good build again.
    sessionStorage.removeItem(RELOAD_FLAG);

    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      // Phones: top of the screen, clear of the bottom-left upload center, AI launcher and install
      // banner. Wider screens: bottom centre, between them. See src/lib/floatingLayer.ts.
      className="fixed inset-x-4 z-50 mx-auto max-w-md top-[calc(0.75rem+env(safe-area-inset-top,0px))] md:top-auto md:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] rounded-xl border border-border bg-card shadow-lg p-3 flex items-center gap-3"
    >
      <RefreshCw className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
      <p className="text-sm flex-1 m-0">גרסה חדשה של המערכת זמינה.</p>
      <button
        type="button"
        onClick={() => apply?.()}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        רענן
      </button>
      <button
        type="button"
        onClick={() => setUpdateReady(false)}
        className="min-h-11 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="סגור את הודעת העדכון"
      >
        אחר כך
      </button>
    </div>
  );
}
