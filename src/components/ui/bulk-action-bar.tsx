// Floating selection bar adapted from the bulk-actions bar of "Data Table Toolbar" (skovhm) on
// 21st.dev: it rises from the bottom while rows are selected, counts them, and holds their actions.
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  /** Plural noun after the number: "פריטים", "עובדים". */
  noun?: string;
  onClear: () => void;
  children: ReactNode;
}

export function BulkActionBar({ count, noun = "פריטים", onClear, children }: BulkActionBarProps) {
  const reduced = useReducedMotion();
  // Escape clears the selection, unless it belongs to an open dialog or menu.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      onClear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, onClear]);
  return (
    <>
      <span className="sr-only" role="status" aria-live="polite">{count > 0 ? `${count} ${noun} נבחרו` : ""}</span>
      <AnimatePresence>
        {count > 0 && (
          <motion.div
            role="toolbar"
            aria-label={`פעולות על ${count} ${noun} שנבחרו`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 16, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed inset-x-0 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-border bg-popover p-2 ps-3 text-popover-foreground shadow-2xl"
            style={{ bottom: "calc(1rem + var(--floating-bottom, 0px) + env(safe-area-inset-bottom, 0px))" }}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">{count}</span>
              {noun} נבחרו
            </span>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
            {children}
            <button
              type="button"
              onClick={onClear}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
              aria-label="ניקוי הבחירה"
              title="ניקוי הבחירה (Esc)"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
