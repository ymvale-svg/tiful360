import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Wrench, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyServiceTickets } from "@/hooks/useServiceTickets";
import { NewPortalTicketDialog } from "@/components/portal/NewPortalTicketDialog";
import { PRIORITY_LABELS, STATUS_CLASSES, STATUS_LABELS, subjectLabel } from "@/lib/serviceTickets";

interface Props {
  employeeId: string;
  employeeName?: string | null;
  employeePhone?: string | null;
}

export function MyTicketsTab({ employeeId, employeeName, employeePhone }: Props) {
  const [open, setOpen] = useState(false);
  const { data: tickets, isLoading } = useMyServiceTickets(employeeId);

  return (
    <div className="space-y-3">
      <Button className="w-full h-12 gap-2 text-base" onClick={() => setOpen(true)}>
        <Plus className="w-5 h-5" aria-hidden="true" />
        פתיחת קריאה חדשה
      </Button>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-8">טוען...</p>
      ) : tickets && tickets.length > 0 ? (
        tickets.map((t: any) => (
          <div key={t.id} className="bg-card rounded-xl border border-border/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", STATUS_CLASSES[t.status])}>
                {STATUS_LABELS[t.status] ?? t.status}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{t.ticket_code}</span>
            </div>
            <p className="text-sm font-medium">{t.title}</p>
            {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {new Date(t.created_at).toLocaleDateString("he-IL")}
              </span>
              <span>
                {subjectLabel(t.subject_category)} • {PRIORITY_LABELS[t.priority] ?? t.priority}
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="text-center py-10 text-muted-foreground">
          <Wrench className="w-10 h-10 mx-auto mb-3 opacity-30" aria-hidden="true" />
          <p className="text-sm">אין לך קריאות שירות פתוחות</p>
        </div>
      )}

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
