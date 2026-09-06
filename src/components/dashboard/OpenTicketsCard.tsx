import { Link } from "react-router-dom";
import { Wrench, Clock, AlertTriangle, ChevronLeft } from "lucide-react";
import { useITTickets } from "@/hooks/useData";
import { PRIORITY_LABELS, STATUS_LABELS, subjectLabel } from "@/lib/serviceTickets";
import { cn } from "@/lib/utils";

const priorityDot = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "bg-info",
  low: "bg-muted-foreground",
};

export function OpenTicketsCard() {
  const { data: tickets, isLoading } = useITTickets();
  const open = (tickets ?? [])
    .filter((t: any) => t.status !== "done")
    .sort((a: any, b: any) => {
      const prioOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (prioOrder[a.priority] !== prioOrder[b.priority]) {
        return prioOrder[a.priority] - prioOrder[b.priority];
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 5);

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">קריאות שירות פתוחות</h2>
        </div>
        <Link to="/it-tickets" className="text-xs text-primary hover:underline flex items-center gap-0.5">
          הכל
          <ChevronLeft className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground text-sm">טוען קריאות...</div>
        )}
        {!isLoading && open.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-sm">אין קריאות פתוחות</div>
        )}
        {open.map((ticket: any) => (
          <Link
            key={ticket.id}
            to={`/it-tickets?selected=${ticket.id}`}
            className="block p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {ticket.title || "ללא כותרת"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {subjectLabel(ticket.subject_category ?? ticket.ticket_type)}
                  {ticket.employees?.full_name && ` • ${ticket.employees.full_name}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    ticket.status === "in_progress"
                      ? "bg-info/15 text-info border-info/40"
                      : "bg-warning/15 text-warning-foreground border-warning/40",
                  )}
                >
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      priorityDot[ticket.priority as keyof typeof priorityDot] ?? priorityDot.medium,
                    )}
                  />
                  {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                </span>
              </div>
            </div>
            {ticket.sla_deadline && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" aria-hidden="true" />
                <span>יעד טיפול: {new Date(ticket.sla_deadline).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
                {new Date(ticket.sla_deadline) < new Date() && (
                  <AlertTriangle className="w-3 h-3 text-destructive" aria-hidden="true" />
                )}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
