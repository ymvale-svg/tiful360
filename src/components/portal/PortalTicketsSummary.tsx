import { ChevronLeft, MessageSquare, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StateView } from "@/components/feedback/StateView";
import { formatDateDMY } from "@/lib/utils";
import { useMyServiceTickets } from "@/hooks/useServiceTickets";
import { StatusChip } from "@/components/portal/MyTicketsTab";

interface Props {
  employeeId: string;
  /** Opens the full list ("בקשות" tab). */
  onOpenAll: () => void;
  onNew: () => void;
}

const LATEST = 4;

/** Home-screen card: how many service tickets are open and the latest few, open ones first. */
export function PortalTicketsSummary({ employeeId, onOpenAll, onNew }: Props) {
  const { data: tickets = [], isLoading, error, refetch } = useMyServiceTickets(employeeId);
  const list = tickets;
  const open = list.filter((t) => t.status !== "done");
  const latest = [...open, ...list.filter((t) => t.status === "done")].slice(0, LATEST);

  return (
    <section aria-labelledby="portal-tickets-title" className="space-y-3 rounded-xl border border-border/50 bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="portal-tickets-title" className="font-semibold lg:text-lg">הקריאות שלי</h2>
        {list.length > 0 && (
          <Button variant="ghost" className="min-h-11 gap-1 text-primary" onClick={onOpenAll}>
            כל הקריאות <ChevronLeft aria-hidden="true" />
          </Button>
        )}
      </div>

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => { void refetch(); }}
        label="קריאות השירות שלך"
        isEmpty={list.length === 0}
        empty={{ icon: <Wrench className="h-6 w-6" />, title: "אין קריאות שירות", description: "משהו לא עובד? פתחו קריאה ונעדכן אתכם כאן." }}
      >
        <p className="text-sm text-muted-foreground">
          {open.length ? <><strong className="text-foreground tabular-nums">{open.length}</strong> {open.length === 1 ? "קריאה פתוחה" : "קריאות פתוחות"}</> : "אין קריאות פתוחות"}
        </p>
        <ul className="divide-y divide-border/60">
          {latest.map((t) => {
            const replyCount = Array.isArray(t.replies) ? t.replies.length : 0;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={onOpenAll}
                  className="flex w-full flex-col gap-1 rounded-lg px-2 py-2.5 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`קריאה ${t.ticket_code ?? ""}: ${t.title}`}
                >
                  <span className="flex items-center gap-2">
                    <StatusChip status={t.status} />
                    {replyCount > 0 && (
                      <span className="flex items-center gap-1 text-xs font-medium text-primary">
                        <MessageSquare className="h-3 w-3" aria-hidden="true" />
                        {replyCount === 1 ? "תגובה אחת" : `${replyCount} תגובות`}
                      </span>
                    )}
                    <span className="ms-auto font-mono text-xs text-muted-foreground">{t.ticket_code}</span>
                  </span>
                  <span className="truncate text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground">עודכנה {formatDateDMY(t.updated_at ?? t.created_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </StateView>

      <Button className="h-11 w-full gap-2" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        קריאה חדשה
      </Button>
    </section>
  );
}
