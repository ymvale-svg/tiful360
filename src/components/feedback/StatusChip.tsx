import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleDot, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "critical" | "info" | "neutral";

const TONE_CLASSES: Record<StatusTone, { chip: string; icon: string }> = {
  success: { chip: "bg-success/10 border-success/30", icon: "text-success" },
  warning: { chip: "bg-warning/10 border-warning/40", icon: "text-warning" },
  critical: { chip: "bg-destructive/10 border-destructive/30", icon: "text-destructive" },
  info: { chip: "bg-info/10 border-info/30", icon: "text-info" },
  neutral: { chip: "bg-muted border-border", icon: "text-muted-foreground" },
};

const TONE_ICONS: Record<StatusTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
  info: Info,
  neutral: CircleDot,
};

/** Severity bar for a row's start edge (MASTER.md: rows get a thin severity bar). */
export const SEVERITY_BAR: Record<StatusTone, string> = {
  success: "border-s-4 border-s-success",
  warning: "border-s-4 border-s-warning",
  critical: "border-s-4 border-s-destructive",
  info: "border-s-4 border-s-info",
  neutral: "border-s-4 border-s-border",
};

/** Text colour for a tone when a chip is too heavy (keep it paired with a word or icon). */
export const TONE_TEXT: Record<StatusTone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  critical: "text-destructive-text",
  info: "text-info-text",
  neutral: "text-muted-foreground",
};

/** Soft tinted surface for a tone (banners, highlighted boxes). */
export const TONE_SURFACE: Record<StatusTone, string> = {
  success: "bg-success/10 border-success/30",
  warning: "bg-warning/10 border-warning/40",
  critical: "bg-destructive/10 border-destructive/30",
  info: "bg-info/10 border-info/30",
  neutral: "bg-muted border-border",
};

interface StatusChipProps {
  tone: StatusTone;
  children: ReactNode;
  /** Overrides the tone's default icon. Pass null to omit the icon. */
  icon?: LucideIcon | null;
  className?: string;
}

/**
 * The one status chip (MASTER.md): icon + word + soft tint. The text stays in the foreground
 * colour so it keeps 4.5:1 contrast in both themes; the tone colour is on the icon and tint.
 */
export function StatusChip({ tone, children, icon, className }: StatusChipProps) {
  const Icon = icon === null ? null : icon ?? TONE_ICONS[tone];
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium text-foreground",
        t.chip,
        className,
      )}
    >
      {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", t.icon)} aria-hidden="true" />}
      {children}
    </span>
  );
}
