import { 
  Shield, CheckCircle2, User, 
  Timer, ChevronLeft, Lock, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useITTickets } from "@/hooks/useData";
import { NewITTicketDialog } from "@/components/NewITTicketDialog";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-info text-info-foreground",
  low: "bg-muted text-muted-foreground",
};
const priorityLabels: Record<string, string> = {
  critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך",
};

export default function ITTickets() {
  const { data: tickets, isLoading } = useITTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localChecklist, setLocalChecklist] = useState<{ label: string; done: boolean }[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  const selectedTicket = tickets?.find(t => t.id === selectedId);

  const openTicket = (ticket: any) => {
    setSelectedId(ticket.id);
    setLocalChecklist(Array.isArray(ticket.checklist) ? [...(ticket.checklist as any[])] : []);
  };

  const toggleCheck = (index: number) => {
    setLocalChecklist(prev => prev.map((item, i) => i === index ? { ...item, done: !item.done } : item));
  };

  const allChecked = localChecklist.length > 0 && localChecklist.every(c => c.done);

  const getSlaRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return "00:00:00";
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">משימות IT</h1>
          <p className="page-subtitle">ניהול קריאות שירות, ניתוקים ואבטחת מידע</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportExcelButton
            disabled={!tickets?.length}
            onClick={() => {
              if (!tickets?.length) return;
              exportToExcel(
                tickets.map((t: any) => ({
                  ticket_code: t.ticket_code,
                  title: t.title,
                  priority: priorityLabels[t.priority] ?? t.priority,
                  status: t.status,
                  type: t.ticket_type,
                  employee: t.employees?.full_name ?? "",
                  sla: t.sla_deadline ? new Date(t.sla_deadline).toLocaleDateString("en-GB") : "",
                })),
                [
                  { key: "ticket_code", label: "מזהה" },
                  { key: "title", label: "כותרת" },
                  { key: "priority", label: "עדיפות" },
                  { key: "status", label: "סטטוס" },
                  { key: "type", label: "סוג" },
                  { key: "employee", label: "עובד" },
                  { key: "sla", label: "SLA" },
                ],
                "קריאות_IT"
              );
            }}
          />
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            קריאה חדשה
          </Button>
        </div>
      </div>

      <NewITTicketDialog open={newOpen} onOpenChange={setNewOpen} />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Ticket list */}
          <div className={cn("lg:col-span-1 space-y-2", selectedTicket && "hidden lg:block")}>
            {(tickets ?? []).map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => openTicket(ticket)}
                className={cn(
                  "w-full text-right bg-card rounded-xl border p-4 transition-all hover:shadow-md",
                  ticket.ticket_type === "offboarding" ? "border-destructive/30" : "border-border/50",
                  selectedId === ticket.id && "ring-2 ring-primary"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority] ?? ""}`}>
                        {priorityLabels[ticket.priority] ?? ticket.priority}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(ticket as any).employees?.full_name}</p>
                  </div>
                  {ticket.ticket_type === "offboarding" && ticket.status !== "done" && ticket.sla_deadline && (
                    <div className="flex items-center gap-1 text-xs font-mono text-destructive bg-destructive/10 px-2 py-1 rounded-md">
                      <Timer className="w-3 h-3" />
                      {getSlaRemaining(ticket.sla_deadline)}
                    </div>
                  )}
                  {ticket.status === "done" && <CheckCircle2 className="w-5 h-5 text-success shrink-0" />}
                </div>
              </button>
            ))}
            {(!tickets || tickets.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">אין קריאות</div>
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-card rounded-xl border border-border/50 shadow-card animate-fade-in">
                <div className={cn("p-5 border-b", selectedTicket.ticket_type === "offboarding" ? "border-destructive/20 bg-destructive/5" : "border-border/50")}>
                  <button onClick={() => setSelectedId(null)} className="lg:hidden flex items-center gap-1 text-sm text-muted-foreground mb-3">
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                    חזרה
                  </button>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">{selectedTicket.ticket_code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[selectedTicket.priority] ?? ""}`}>
                          {priorityLabels[selectedTicket.priority] ?? selectedTicket.priority}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold">{selectedTicket.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />{(selectedTicket as any).employees?.full_name}
                      </p>
                    </div>
                    {selectedTicket.ticket_type === "offboarding" && selectedTicket.sla_deadline && (
                      <div className="flex flex-col items-center gap-1 bg-destructive/10 px-4 py-2 rounded-lg">
                        <Timer className="w-5 h-5 text-destructive" />
                        <span className="text-lg font-mono font-bold text-destructive">{getSlaRemaining(selectedTicket.sla_deadline)}</span>
                        <span className="text-[10px] text-destructive">SLA נותר</span>
                      </div>
                    )}
                  </div>
                </div>

                {selectedTicket.ticket_type === "offboarding" && localChecklist.length > 0 ? (
                  <div className="p-5">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                      <Lock className="w-4 h-4 text-destructive" />
                      מטריצת ניתוקים
                    </h3>
                    <div className="space-y-3">
                      {localChecklist.map((item, i) => (
                        <label key={i} className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          item.done ? "bg-success/5 border-success/30" : "bg-card border-border hover:bg-muted/50"
                        )}>
                          <input type="checkbox" checked={item.done} onChange={() => toggleCheck(i)} className="w-5 h-5 rounded accent-success" />
                          <span className={cn("text-sm flex-1", item.done && "line-through text-muted-foreground")}>{item.label}</span>
                          {item.done && <CheckCircle2 className="w-4 h-4 text-success" />}
                        </label>
                      ))}
                    </div>
                    <div className="mt-6 pt-4 border-t border-border/50">
                      <Button disabled={!allChecked} className={cn("w-full gap-2", allChecked ? "bg-destructive hover:bg-destructive/90" : "")}>
                        <Shield className="w-4 h-4" />
                        {allChecked ? "אשר ניתוק סופי (דורש סיסמה)" : `${localChecklist.filter(c => c.done).length}/${localChecklist.length} סעיפים הושלמו`}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">פרטי הקריאה</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium">בחר קריאה מהרשימה</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
