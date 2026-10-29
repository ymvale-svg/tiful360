import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus, Wrench, Clock, CheckCircle2, CircleDot, Loader, Paperclip, MessageSquare, MapPin, Phone, ChevronLeft } from "lucide-react";
import { cn, formatDateDMY, formatDateTimeDMY } from "@/lib/utils";
import { useMyServiceTickets } from "@/hooks/useServiceTickets";
import { NewPortalTicketDialog } from "@/components/portal/NewPortalTicketDialog";
import { StateView } from "@/components/feedback/StateView";
import { PRIORITY_LABELS, STATUS_CLASSES, STATUS_LABELS, subjectLabel } from "@/lib/serviceTickets";

interface Props {
  employeeId: string;
  employeeName?: string | null;
  employeePhone?: string | null;
  /** Hide the big "פתיחת קריאה חדשה" button when the screen already offers one. */
  showNewButton?: boolean;
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = { open: CircleDot, in_progress: Loader, done: CheckCircle2 };

/** Status as text + icon, never colour alone. */
export function StatusChip({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? CircleDot;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", STATUS_CLASSES[status])}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function MyTicketsTab({ employeeId, employeeName, employeePhone, showNewButton = true }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: tickets = [], isLoading, error, refetch } = useMyServiceTickets(employeeId);
  const selected: any = (tickets as any[]).find((t) => t.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      {showNewButton && (
        <Button className="w-full h-12 gap-2 text-base" onClick={() => setOpen(true)}>
          <Plus className="w-5 h-5" aria-hidden="true" />
          פתיחת קריאה חדשה
        </Button>
      )}

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => { void refetch(); }}
        label="קריאות השירות שלך"
        isEmpty={tickets.length === 0}
        empty={{
          icon: <Wrench className="w-6 h-6" />,
          title: "עדיין לא פתחת קריאות שירות",
          description: "תקלה במחשב, בטלפון או במשרד? פתחו קריאה ונעדכן אתכם כאן בכל שלב.",
          action: showNewButton ? undefined : (
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
              <Plus aria-hidden="true" /> פתיחת קריאה
            </Button>
          ),
        }}
      >
        <ul className="space-y-2">
          {(tickets as any[]).map((t) => {
            const replyCount = Array.isArray(t.replies) ? t.replies.length : 0;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className="w-full text-right bg-card rounded-xl border border-border/50 p-3 space-y-1.5 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`פתח קריאה ${t.ticket_code ?? ""}: ${t.title}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusChip status={t.status} />
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_code}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium flex-1 min-w-0">{t.title}</p>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {formatDateDMY(t.created_at)}
                    </span>
                    {replyCount > 0 && (
                      <span className="flex items-center gap-1 text-primary font-medium">
                        <MessageSquare className="w-3 h-3" aria-hidden="true" />
                        {replyCount === 1 ? "תגובה אחת" : `${replyCount} תגובות`}
                      </span>
                    )}
                    <span>
                      {subjectLabel(t.subject_category)} • {PRIORITY_LABELS[t.priority] ?? t.priority}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </StateView>

      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) setSelectedId(null); }}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {selected && <TicketDetail ticket={selected} />}
        </SheetContent>
      </Sheet>

      <NewPortalTicketDialog
        open={open}
        onOpenChange={setOpen}
        employeeId={employeeId}
        employeeName={employeeName}
        employeePhone={employeePhone}
      />
    </div>
  );
}

/** Read-only view of one of the employee's own tickets: status, details, staff replies and attachments. */
function TicketDetail({ ticket }: { ticket: any }) {
  const replies: any[] = Array.isArray(ticket.replies) ? ticket.replies : [];
  const attachments: { name: string; url: string }[] = Array.isArray(ticket.attachments) ? ticket.attachments : [];
  return (
    <div className="space-y-5 text-right">
      <SheetHeader className="text-right space-y-2">
        <div className="flex items-center gap-2">
          <StatusChip status={ticket.status} />
          <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_code}</span>
        </div>
        <SheetTitle className="text-lg">{ticket.title}</SheetTitle>
        <SheetDescription>
          {subjectLabel(ticket.subject_category)} • דחיפות {PRIORITY_LABELS[ticket.priority] ?? ticket.priority} • נפתחה {formatDateTimeDMY(ticket.created_at)}
        </SheetDescription>
      </SheetHeader>

      {ticket.description && (
        <section>
          <h3 className="text-sm font-semibold mb-1">תיאור</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{ticket.description}</p>
        </section>
      )}

      {(ticket.location || ticket.contact_phone) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {ticket.location && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />{ticket.location}</p>}
          {ticket.contact_phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span dir="ltr">{ticket.contact_phone}</span></p>}
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold mb-2">תגובות הצוות</h3>
        {replies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {ticket.status === "done" ? "הקריאה טופלה." : "עדיין אין תגובות. נעדכן אותך כאן ובמייל כשתהיה התקדמות."}
          </p>
        ) : (
          <ul className="space-y-2">
            {replies.map((r: any, i: number) => (
              <li key={r.id ?? i} className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">
                    {r.author || "צוות התפעול"}{r.kind === "done" ? " • הקריאה טופלה" : ""}
                  </span>
                  <span>{formatDateTimeDMY(r.created_at)}</span>
                </div>
                {r.message ? <p className="whitespace-pre-wrap">{r.message}</p> : r.kind === "done" ? <p>הקריאה סומנה כטופלה.</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {attachments.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-1">קבצים מצורפים</h3>
          <ul className="space-y-1">
            {attachments.map((a, i) => (
              <li key={i}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 min-h-11 text-sm text-primary hover:underline">
                  <Paperclip className="w-4 h-4" aria-hidden="true" />{a.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
