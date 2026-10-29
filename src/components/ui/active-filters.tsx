// Active-filter chips adapted from "Filter Toolbar" by kuratlielia on 21st.dev: every applied filter is
// a chip with its own remove button, chips grow in and collapse out, and removing one hands focus to
// its neighbour. Filters that persist between visits are therefore never invisible.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ActiveFilter {
  id: string;
  label: string;
  value?: string;
  onRemove: () => void;
}

interface ActiveFiltersProps {
  filters: ActiveFilter[];
  onClearAll?: () => void;
  /** Shown before the chips, e.g. the result count. */
  summary?: ReactNode;
  className?: string;
}

const describe = (f: { label: string; value?: string }) => (f.value ? `${f.label}: ${f.value}` : f.label);

export function ActiveFilters({ filters, onClearAll, summary, className }: ActiveFiltersProps) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const [message, setMessage] = useState("");

  // A removed chip hands focus to the next one, or to the first focusable thing after the bar.
  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    const buttons = root.current?.querySelectorAll<HTMLButtonElement>("[data-chip-remove]");
    const next = buttons?.[Math.min(index, (buttons?.length ?? 1) - 1)];
    next?.focus();
  }, [filters]);

  if (!filters.length && !summary) return null;

  return (
    <div ref={root} className={cn("flex flex-wrap items-center gap-2", className)} role="group" aria-label="סינונים פעילים">
      {summary && <span className="text-sm text-muted-foreground">{summary}</span>}
      <AnimatePresence initial={false}>
        {filters.map((f, index) => (
          <motion.span
            key={f.id}
            layout={!reduced}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-0.5 pe-0.5 ps-3 text-xs"
          >
            <span className="text-muted-foreground">{f.label}{f.value ? ":" : ""}</span>
            {f.value && <span className="max-w-[18ch] truncate font-medium text-foreground">{f.value}</span>}
            <button
              type="button"
              data-chip-remove={f.id}
              onClick={() => {
                pendingFocus.current = index;
                setMessage(`הסינון ${describe(f)} הוסר`);
                f.onRemove();
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-9 [@media(pointer:coarse)]:w-9"
              aria-label={`הסרת הסינון ${describe(f)}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      {onClearAll && filters.length > 1 && (
        <button
          type="button"
          onClick={() => { setMessage("כל הסינונים הוסרו"); onClearAll(); }}
          className="min-h-8 rounded px-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          נקה הכל
        </button>
      )}
      <span className="sr-only" role="status">{message}</span>
    </div>
  );
}
