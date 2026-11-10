// Day-grouped activity feed adapted from "Timeline" by kuratlielia on 21st.dev: a rail that ties the
// events of a day together, a tinted icon per kind of event, and new events that slide in.
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { dayLabel, groupByDay } from "@/lib/timelineDays";

export type TimelineTone = "primary" | "info" | "success" | "warning" | "destructive" | "muted";

export interface TimelineItem {
  id: string;
  /** ISO date or timestamp. */
  at: string;
  icon: LucideIcon;
  title: string;
  detail?: string;
  actor?: string;
  tone?: TimelineTone;
}

const TONE: Record<TimelineTone, string> = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const hasTime = (at: string) => at.length > 10;

export function ActivityTimeline({ items, className }: { items: readonly TimelineItem[]; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <div className={cn("space-y-6", className)}>
      {groupByDay(items).map((g) => (
        <section key={g.key} aria-labelledby={`tl-${g.key}`}>
          <h3 id={`tl-${g.key}`} className="mb-3 text-xs font-semibold text-muted-foreground">
            {g.key ? dayLabel(g.key) : "ללא תאריך"}
          </h3>
          <ol className="relative space-y-4 before:absolute before:inset-y-2 before:right-[15px] before:w-px before:bg-border">
            <AnimatePresence initial={false}>
              {g.items.map((e) => {
                const Icon = e.icon;
                return (
                  <motion.li
                    key={e.id}
                    layout={!reduced}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    className="relative flex items-start gap-3"
                  >
                    <span className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ring-4 ring-card", TONE[e.tone ?? "muted"])} aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 pt-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-medium break-words">{e.title}</p>
                        {hasTime(e.at) && (
                          <time dateTime={e.at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {new Date(e.at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                          </time>
                        )}
                      </div>
                      {e.detail && <p className="mt-0.5 text-xs text-muted-foreground break-words">{e.detail}</p>}
                      {e.actor && <p className="mt-0.5 text-xs text-muted-foreground">בוצע על ידי: {e.actor}</p>}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </section>
      ))}
    </div>
  );
}
