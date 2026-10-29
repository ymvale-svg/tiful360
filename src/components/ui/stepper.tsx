// Step indicator adapted from "Stepper with Square Badges" (shadcnspace) on 21st.dev: square badges,
// a check on finished steps, and a connector that fills as you move forward. Finished steps can be
// revisited; later ones stay locked until the current step is valid.
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface StepperStep {
  label: string;
  icon?: LucideIcon;
}

interface StepperProps {
  steps: readonly StepperStep[];
  current: number;
  /** Called for a finished step; leave out to make the stepper display-only. */
  onStepClick?: (index: number) => void;
  label?: string;
  className?: string;
}

export function Stepper({ steps, current, onStepClick, label = "שלבים", className }: StepperProps) {
  const reduced = useReducedMotion();
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs text-muted-foreground sm:hidden" aria-hidden="true">
        שלב {current + 1} מתוך {steps.length}: <span className="font-medium text-foreground">{steps[current]?.label}</span>
      </p>
      <ol className="flex items-start" aria-label={`${label}: שלב ${current + 1} מתוך ${steps.length}`}>
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          const Icon = s.icon;
          const clickable = done && !!onStepClick;
          const badge = (
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-xs font-semibold tabular-nums transition-colors duration-300",
                active && "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/30",
                done && "border-primary bg-primary/10 text-primary",
                !active && !done && "border-border bg-card text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" /> : i + 1}
            </span>
          );
          return (
            <li
              key={s.label}
              className={cn("relative flex min-w-0 flex-col items-start gap-1.5", i < steps.length - 1 && "flex-1")}
              aria-current={active ? "step" : undefined}
            >
              {i < steps.length - 1 && (
                // Connector from this badge to the next one; RTL, so it grows leftwards.
                <span className="absolute right-10 left-2 top-4 h-0.5 -translate-y-1/2 overflow-hidden rounded-full bg-border" aria-hidden="true">
                  <motion.span
                    className="block h-full origin-right bg-primary"
                    initial={false}
                    animate={{ scaleX: done ? 1 : 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
                  />
                </span>
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  className="group flex flex-col items-start gap-1.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`חזרה לשלב ${i + 1}: ${s.label}`}
                >
                  {badge}
                  <span className="hidden max-w-[16ch] truncate text-xs text-primary group-hover:underline sm:block">{s.label}</span>
                </button>
              ) : (
                <>
                  {badge}
                  <span className={cn("max-w-[16ch] truncate text-xs", active ? "font-semibold text-foreground" : "text-muted-foreground", "hidden sm:block")}>
                    {s.label}
                  </span>
                  <span className="sr-only sm:hidden">{s.label}{active ? " (השלב הנוכחי)" : done ? " (הושלם)" : ""}</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
