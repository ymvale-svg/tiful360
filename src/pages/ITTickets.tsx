import { useEffect, useMemo, useState } from "react";
import {
  Wrench, CheckCircle2, User, Timer, ChevronLeft, Plus, Package,
  MapPin, Phone, Paperclip, CalendarClock, AlertTriangle, ListChecks,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useITTickets } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateTicketStatus } from "@/hooks/useServiceTickets";
import { NewITTicketDialog } from "@/components/NewITTicketDialog";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";
import { toast } from "sonner";
import {
  PRIORITY_LABELS, STATUS_CLASSES, STATUS_LABELS, slaRemaining, subjectLabel,
} from "@/lib/serviceTickets";

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-info text-info-foreground",
  low: "bg-muted text-muted-foreground",
};

function SlaBadge({ deadline, done }: { deadline: string | null; done: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  if (!deadline || done) return null;
  const sla = slaRemaining(deadline);
  if (!sla) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs font-mono px-2 py-1 rounded-md",
        sla.breached ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {sla.breached ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : <Timer className="w-3 h-3" aria-hidden="true" />}
      {sla.breached ? `חריגה ${sla.label}` : sla.label}
    </div>
  );
}

export default function ITTickets() {
  const { data: tickets, isLoading } = useITTickets();
  const updateStatus = useUpdateTicketStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("open_all");

  const filtered = (tickets ?? []).filter((t: any) =>
    statusFilter === "all" ? true : statusFilter === "open_all" ? t.status !== "done" : t.status === statusFilter,
  );
  const selectedTicket: any = tickets?.find((t: any) => t.id === selectedId);
  const attachments: { name: string; url: string }[] = Array.isArray(selectedTicket?.attachments)
    ? (selectedTicket.attachments as any[])
    : [];

  const checklist = useMemo<{ label: string; done: boolean }[]>(
    () => (Array.isArray(selectedTicket?.checklist) ? (selectedTicket.checklist as any[]) : []),
    [selectedTicket],
  );
  const [savingCheck, setSavingCheck] = useState(false);
  const queryClient = useQueryClient();

  const toggleCheck = async (index: number) => {
    if (!selectedTicket || savingCheck) return;
    const next = checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setSavingCheck(true);
    try {
      const { error } = await supabase.from("it_tickets").update({ checklist: next }).eq("id", selectedTicket.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בעדכון המשימה");
    } finally {
      setSavingCheck(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      await updateStatus.mutateAsync({ id: selectedTicket.id, status });
      toast.success("סטטוס הקריאה עודכן");
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בעדכון הסטטוס");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="page-title">קריאות שירות</h1>
          <p className="page-subtitle">קריאות עובדים בטיפול מחלקת התפעול</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open_all">פתוחות ובטיפול</SelectItem>
              <SelectItem value="open">נפתחו</SelectItem>
              <SelectItem value="in_progress">בטיפול</SelectItem>
              <SelectItem value="done">טופלו</SelectItem>
              <SelectItem value="all">הכל</SelectItem>
            </SelectContent>
          </Select>
          <ExportExcelButton
            disabled={!filtered.length}
            onClick={() => {
              exportToExcel(
                filtered.map((t: any) => ({
                  ticket_code: t.ticket_code,
                  title: t.title,
                  subject: subjectLabel(t.subject_category ?? t.ticket_type),
                  priority: PRIORITY_LABELS[t.priority] ?? t.priority,
                  status: STATUS_LABELS[t.status] ?? t.status,
                  employee: t.employees?.full_name ?? "",
                  sla: t.sla_deadline ? new Date(t.sla_deadline).toLocaleString("en-GB") : "",
                })),
                [
                  { key: "ticket_code", label: "מזהה" },
                  { key: "title", label: "כותרת" },
                  { key: "subject", label: "נושא" },
                  { key: "priority", label: "דחיפות" },
                  { key: "status", label: "סטטוס" },
                  { key: "employee", label: "עובד" },
                  { key: "sla", label: "יעד טיפול" },
                ],
                "קריאות_שירות",
              );
            }}
          />
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" aria-hidden="true" />
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
            {filtered.map((ticket: any) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedId(ticket.id)}
                className={cn(
                  "w-full text-right bg-card rounded-xl border p-4 transition-all hover:shadow-md",
                  ticket.ticket_type === "offboarding" ? "border-destructive/30" : "border-border/50",
                  selectedId === ticket.id && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_code}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority] ?? ""}`}>
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </span>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", STATUS_CLASSES[ticket.status])}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                    </div>
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {subjectLabel(ticket.subject_category ?? ticket.ticket_type)} · {ticket.employees?.full_name}
                    </p>
                  </div>
                  {ticket.status === "done"
                    ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
                    : <SlaBadge deadline={ticket.sla_deadline} done={false} />}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">אין קריאות להצגה</div>
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-card rounded-xl border border-border/50 shadow-card animate-fade-in">
                <div className="p-5 border-b border-border/50">
                  <button onClick={() => setSelectedId(null)} className="lg:hidden flex items-center gap-1 text-sm text-muted-foreground mb-3">
                    <ChevronLeft className="w-4 h-4 rotate-180" aria-hidden="true" />
                    חזרה
                  </button>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-mono text-sm text-muted-foreground">{selectedTicket.ticket_code}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[selectedTicket.priority] ?? ""}`}>
                          {PRIORITY_LABELS[selectedTicket.priority] ?? selectedTicket.priority}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {subjectLabel(selectedTicket.subject_category ?? selectedTicket.ticket_type)}
                        </span>
                      </div>
                      <h2 className="text-lg font-bold">{selectedTicket.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" aria-hidden="true" />{selectedTicket.employees?.full_name}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <SlaBadge deadline={selectedTicket.sla_deadline} done={selectedTicket.status === "done"} />
                      <Select value={selectedTicket.status} onValueChange={changeStatus}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">נפתחה</SelectItem>
                          <SelectItem value="in_progress">בטיפול</SelectItem>
                          <SelectItem value="done">טופלה</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {selectedTicket.description && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">תיאור</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedTicket.description}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {selectedTicket.location && (
                      <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-muted-foreground" aria-hidden="true" />{selectedTicket.location}</p>
                    )}
                    {selectedTicket.contact_phone && (
                      <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" aria-hidden="true" /><span dir="ltr">{selectedTicket.contact_phone}</span></p>
                    )}
                    <p className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      נפתחה: {new Date(selectedTicket.created_at).toLocaleString("he-IL")}
                    </p>
                    {selectedTicket.sla_deadline && (
                      <p className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        יעד טיפול: {new Date(selectedTicket.sla_deadline).toLocaleString("he-IL")}
                      </p>
                    )}
                  </div>

                  {selectedTicket.related_asset_id && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">פריט קשור</h3>
                      <Link
                        to={`/assets/${selectedTicket.related_asset?.asset_categories?.domain ?? "physical"}/${selectedTicket.related_asset_id}`}
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <Package className="w-4 h-4" aria-hidden="true" />
                        {selectedTicket.related_asset?.asset_name ?? "מעבר לכרטיס הפריט"}
                        {selectedTicket.related_asset?.asset_code ? ` (${selectedTicket.related_asset.asset_code})` : ""}
                      </Link>
                    </div>
                  )}

                  {checklist.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <ListChecks className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        מטריצת ניתוקים ומשיכת ציוד ({checklist.filter((c) => c.done).length}/{checklist.length})
                      </h3>
                      <ul className="space-y-2">
                        {checklist.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Checkbox
                              id={`chk-${selectedTicket.id}-${i}`}
                              checked={!!item.done}
                              disabled={savingCheck}
                              onCheckedChange={() => toggleCheck(i)}
                              className="mt-0.5"
                            />
                            <label
                              htmlFor={`chk-${selectedTicket.id}-${i}`}
                              className={cn("text-sm cursor-pointer", item.done && "line-through text-muted-foreground")}
                            >
                              {item.label}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">קבצים מצורפים</h3>
                      <ul className="space-y-1">
                        {attachments.map((a, i) => (
                          <li key={i}>
                            <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />{a.name}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
                <Wrench className="w-12 h-12 mx-auto mb-4 opacity-20" aria-hidden="true" />
                <p className="font-medium">בחר קריאה מהרשימה</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
