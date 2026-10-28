import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { saveActivity } from "@/lib/saveActivity";

/** Wait before showing the bar, so near-instant saves don't flash it. */
const SHOW_AFTER_MS = 250;

type Phase = "hidden" | "running" | "finishing";

/**
 * Thin progress bar along the top of the screen while anything is being saved: every React Query
 * mutation (opt out with `meta: { silent: true }`) plus async button clicks and trackSave() calls.
 * Saves report no byte counts, so it eases towards 85% and completes when the save settles.
 */
export function SaveProgressBar() {
  const mutating = useIsMutating({ predicate: (m) => !m.options.meta?.silent });
  const tracked = useSyncExternalStore(saveActivity.subscribe, saveActivity.get);
  const active = mutating + tracked > 0;

  const [phase, setPhase] = useState<Phase>("hidden");
  const [width, setWidth] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (active) {
      if (phaseRef.current === "running") return;
      const show = setTimeout(() => {
        setPhase("running");
        setWidth(0);
        // Next frame, so the width transition starts from zero.
        requestAnimationFrame(() => setWidth(85));
      }, SHOW_AFTER_MS);
      return () => clearTimeout(show);
    }
    if (phaseRef.current !== "running") return;
    setPhase("finishing");
    setWidth(100);
    const hide = setTimeout(() => { setPhase("hidden"); setWidth(0); }, 600);
    return () => clearTimeout(hide);
  }, [active]);

  return (
    <>
      {phase !== "hidden" && (
        <div
          role="progressbar"
          aria-label="שמירת שינויים"
          aria-valuetext={phase === "running" ? "שומר" : "הסתיים"}
          className="fixed inset-x-0 z-[200] h-[3px] pointer-events-none"
          style={{ top: "env(safe-area-inset-top, 0px)" }}
        >
          <div
            className="h-full bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.6)]"
            style={{
              width: `${width}%`,
              opacity: phase === "finishing" ? 0 : 1,
              transition: reduceMotion
                ? "none"
                : phase === "running"
                  ? "width 8s cubic-bezier(.1,.6,.3,1)"
                  : "width .2s ease-out, opacity .3s ease-in .25s",
            }}
          />
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {phase === "running" ? "שומר שינויים…" : ""}
      </span>
    </>
  );
}
