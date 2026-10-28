import type { ReactNode } from "react";
import { AlertCircle, Inbox, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface EmptyProps {
  title: string;
  description?: ReactNode;
  /** The first thing to do, or "נקה סינון" when filters hid everything. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** An empty state that says why the list is empty and what to do next. */
export function EmptyState({ title, description, action, icon, className }: EmptyProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
        {icon ?? <Inbox className="h-6 w-6" />}
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-[40ch] text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Rows of skeletons shaped like a list, so the layout doesn't jump when data arrives. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("divide-y divide-border/50", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface StateViewProps {
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** True when there is nothing to show. Checked only after loading and error. */
  isEmpty?: boolean;
  empty?: EmptyProps;
  /** Custom skeleton; defaults to ListSkeleton. */
  skeleton?: ReactNode;
  /** Name of what is loading, for screen readers ("קריאות שירות"). */
  label?: string;
  children: ReactNode;
}

/**
 * Loading → error → empty → content, in that order, so a failed or slow load never
 * reads as "nothing found".
 */
export function StateView({ loading, error, onRetry, isEmpty, empty, skeleton, label, children }: StateViewProps) {
  if (loading) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{label ? `טוען ${label}…` : "טוען…"}</span>
        {skeleton ?? <ListSkeleton />}
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-destructive/10 text-destructive" aria-hidden="true">
          <AlertCircle className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold">{label ? `לא הצלחנו לטעון ${label}` : "לא הצלחנו לטעון את הנתונים"}</p>
        <p className="max-w-[40ch] text-sm text-muted-foreground">בדקו את החיבור לאינטרנט ונסו שוב.</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
            <RotateCw /> נסה שוב
          </Button>
        )}
      </div>
    );
  }
  if (isEmpty && empty) return <EmptyState {...empty} />;
  return <>{children}</>;
}
