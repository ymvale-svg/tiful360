import { RowContextMenu, copyAction } from "@/components/context/RowContextMenu";
import { useEffect, useMemo, useState } from "react";
import {
  Wrench, CheckCircle2, User, Timer, ChevronLeft, Plus, Package,
  MapPin, Phone, Paperclip, CalendarClock, AlertTriangle, ListChecks, Send, ListTodo,
} from "lucide-react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatDateTimeDMY } from "@/lib/utils";
import { useITTickets } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StateView } from "@/components/feedback/StateView";
import { undoToast } from "@/components/feedback/undoToast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateTicketStatus } from "@/hooks/useServiceTickets";
import { NewITTicketDialog } from "@/components/NewITTicketDialog";
import { SendToMesimonButton } from "@/components/SendToMesimonButton";
import { EmployeeLink } from "@/components/EmployeeLink";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";
import { toast } from "sonner";
import { useWebMCP } from "use-webmcp-tool";
import { runWebMCPTool } from "@/lib/webmcp-telemetry";
import { validateTicketFilter, visibleTicketId } from "@/lib/ticket-view-actions";
import {
  PRIORITY_LABELS, STATUS_CLASSES, STATUS_LABELS, slaRemaining, subjectLabel, addBusinessHours,
} from "@/lib/serviceTickets";

const priorityColors: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-info text-info-foreground",
  low: "bg-muted text-muted-foreground",
};

function useCompanyHolidaySet() {
  const { activeCompanyId } = useCompany();
  const { data } = useQuery({
    queryKey: ["company_holidays", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays" as any)
        .select("holiday_date")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return useMemo(() => new Set((data ?? []).map((h: any) => String(h.holiday_date).slice(0, 10))), [data]);
}

function SlaBadge({ deadline, done, holidays }: { deadline: string | null; done: boolean; holidays?: Set<string> }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  if (!deadline || done) return null;
  const sla = slaRemaining(deadline, holidays);
  if (!sla) return null;
  return (
    <div
      title={`יעד טיפול: ${formatDateTimeDMY(deadline)} (שעות עבודה)`}
      className={cn(
        "flex items-center gap-1 text-xs px-2 py-1 rounded-md whitespace-nowrap",
        sla.breached ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {sla.breached ? <AlertTriangle className="w-3 h-3" aria-hidden="true" /> : <Timer className="w-3 h-3" aria-hidden="true" />}
      {sla.breached ? `חריגה ${sla.label}` : `נותרו ${sla.label}`}
    </div>
  );
}

const toLocalInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function EditSlaDialog({ ticket, open, onOpenChange, holidays }: { ticket: any; open: boolean; onOpenChange: (v: boolean) => void; holidays: Set<string> }) {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [addHours, setAddHours] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) { setValue(toLocalInput(ticket?.sla_deadline)); setAddHours(""); setReason(""); }
  }, [open, ticket?.id]);

  const applyAdd = () => {
    const h = Number(addHours);
    if (!h || h <= 0) return;
    const base = ticket?.sla_deadline && new Date(ticket.sla_deadline) > new Date() ? new Date(ticket.sla_deadline) : new Date();
    setValue(toLocalInput(addBusinessHours(base, h, holidays).toISOString()));
  };

  const save = async () => {
    const d = new Date(value);
    if (isNaN(d.getTime())) { toast.error("יש לבחור תאריך ושעה"); return; }
    setSaving(true);
    const { error } = await supabase.from("it_tickets").update({ sla_deadline: d.toISOString() }).eq("id", ticket.id);
    if (error) { setSaving(false); toast.error(error.message); return; }
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("activity_log").insert({
      entity_type: "it_ticket",
      entity_id: ticket.id,
      employee_id: ticket.employee_id ?? null,
      company_id: ticket.company_id ?? null,
      action: `עדכון יעד טיפול - ${ticket.ticket_code ?? ""}`.trim(),
      details: `מ-${ticket.sla_deadline ? formatDateTimeDMY(ticket.sla_deadline) : "—"} ל-${formatDateTimeDMY(d.toISOString())}${reason ? ` · סיבה: ${reason}` : ""}`,
      performed_by: u.user?.id ?? null,
    } as any);
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["it-tickets"] });
    toast.success("יעד הטיפול עודכן");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!saving) onOpenChange(v); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>עריכת יעד טיפול (SLA)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sla-dt">מועד יעד חדש</Label>
            <Input id="sla-dt" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-add">או הוספת שעות עבודה</Label>
            <div className="flex gap-2">
              <Input id="sla-add" type="number" min={1} value={addHours} onChange={(e) => setAddHours(e.target.value)} placeholder="למשל 8" />
              <Button type="button" variant="outline" onClick={applyAdd}>הוסף</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-reason">סיבה</Label>
            <Textarea id="sla-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <Link to="/settings?tab=alerts" className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">ערוך זמני תקן כלליים</Link>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>ביטול</Button>
          <Button onClick={save} loading={saving} loadingText="שומר…">שמור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ITTickets() {
  const navigate = useNavigate();
  const { data: tickets, isLoading, error: ticketsError, refetch: refetchTickets } = useITTickets();
  const { activeCompanyId, setActiveCompanyId } = useCompany();
  const updateStatus = useUpdateTicketStatus();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [slaEditOpen, setSlaEditOpen] = useState(false);
  const holidays = useCompanyHolidaySet();
  const [statusFilter, setStatusFilter] = useState<string>("open_all");
  const [forwardFilter, setForwardFilter] = useState<string>("any");
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep link from email: /it-tickets?ticket=<id|ticket_code> — and from header search / open-tickets card: ?selected=<id>
  const deepLink = searchParams.get("ticket") ?? searchParams.get("selected");
  useEffect(() => {
    if (!deepLink || !tickets) return;
    const clearParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("ticket");
      next.delete("selected");
      setSearchParams(next, { replace: true });
    };
    const match = (tickets as any[]).find(
      (t: any) => t.id === deepLink || t.ticket_code?.toLowerCase() === deepLink.toLowerCase(),
    );
    if (match) {
      setSelectedId(match.id);
      setStatusFilter("all");
      clearParam();
      return;
    }
    // Not in the active company — the ticket may belong to another company the user has access to.
    let cancelled = false;
    (async () => {
      const isUuid = /^[0-9a-f-]{36}$/i.test(deepLink);
      const { data } = await supabase
        .from("it_tickets")
        .select("id, company_id")
        .or(isUuid ? `id.eq.${deepLink}` : `ticket_code.eq.${deepLink}`)
        .maybeSingle();
      if (cancelled) return;
      if (data?.company_id && data.company_id !== activeCompanyId) {
        setActiveCompanyId(data.company_id); // keep the param so the effect re-runs after reload
        return;
      }
      toast.error("הקריאה לא נמצאה או שאין לך הרשאה לצפות בה");
      clearParam();
    })();
    return () => { cancelled = true; };
  }, [deepLink, tickets, activeCompanyId]);

  const hasItForward = (t: any) => Array.isArray(t.it_forwards) && t.it_forwards.length > 0;
  const byStatus = (tickets ?? []).filter((t: any) =>
    statusFilter === "all" ? true : statusFilter === "open_all" ? t.status !== "done" : t.status === statusFilter,
  );
  const filtered = byStatus.filter((t: any) => {
    if (forwardFilter === "it") return hasItForward(t);
    if (forwardFilter === "mesimon") return !!t.mesimon_task_id;
    if (forwardFilter === "none") return !hasItForward(t) && !t.mesimon_task_id;
    return true;
  });
  const forwardCount = (value: string) => {
    if (value === "it") return byStatus.filter(hasItForward).length;
    if (value === "mesimon") return byStatus.filter((t: any) => !!t.mesimon_task_id).length;
    if (value === "none") return byStatus.filter((t: any) => !hasItForward(t) && !t.mesimon_task_id).length;
    return byStatus.length;
  };
  const changeStatusFilter = (value: unknown) => setStatusFilter(validateTicketFilter(value));
  const openVisibleTicket = (value: unknown) => setSelectedId(visibleTicketId(value, filtered));
  useWebMCP({
    name: "read_visible_service_tickets",
    description: "קרא את הקריאות המוצגות במסך בהתאם לחברה ולסינון הנוכחי.",
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => runWebMCPTool("read_visible_service_tickets", () => isLoading ? "הקריאות נטענות" : filtered.length ? filtered.slice(0, 50).map((ticket) => `${ticket.id}: ${ticket.ticket_code} — ${ticket.title} — ${STATUS_LABELS[ticket.status] ?? ticket.status}`).join("\n") : "אין קריאות מוצגות"),
  });
  useWebMCP({
    name: "filter_service_tickets", description: "שנה את סינון הסטטוס של הקריאות המוצגות.",
    inputSchema: { type: "object", properties: { status: { type: "string", enum: ["open_all", "open", "in_progress", "done", "all"], description: "סטטוס הקריאות להצגה" } }, required: ["status"], additionalProperties: false },
    execute: ({ status }: { status: string }) => runWebMCPTool("filter_service_tickets", () => { changeStatusFilter(status); return "הסינון עודכן"; }),
  });
  useWebMCP({
    name: "open_service_ticket", description: "פתח פרטי קריאה מתוך הרשימה המוצגת בלבד.",
    enabled: !isLoading,
    inputSchema: { type: "object", properties: { ticket_id: { type: "string", description: "מזהה קריאה מתוך הרשימה הנוכחית" } }, required: ["ticket_id"], additionalProperties: false },
    execute: ({ ticket_id }: { ticket_id: string }) => runWebMCPTool("open_service_ticket", () => { openVisibleTicket(ticket_id); return "פרטי הקריאה נפתחו"; }),
  });
  const selectedTicket: any = tickets?.find((t: any) => t.id === selectedId);
  const [sendingIT, setSendingIT] = useState(false);
  const [itNoteOpen, setItNoteOpen] = useState(false);
  const [itNote, setItNote] = useState("");
  const openSendToIT = () => { setItNote(""); setItNoteOpen(true); };
  const sendToIT = async () => {
    if (!selectedTicket) return;
    const note = itNote.trim();
    setSendingIT(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-it-ticket", {
        body: { ticket_id: selectedTicket.id, target: "it", note },
      });
      if (error) throw error;
      if (!data?.sent) toast.error("לא הוגדרו כתובות IT לחברה — יש להגדיר בהגדרות החברה");
      else {
        await queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
        toast.success(`הקריאה נשלחה ל-IT (${data.sent} נמענים)`);
      }
      setItNoteOpen(false);
    } catch (e: any) {
      toast.error("שליחה ל-IT נכשלה", { description: e?.message } as any);
    } finally {
      setSendingIT(false);
    }
  };

  useEffect(() => {
    if (selectedId) document.getElementById("ticket-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

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

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const replies: any[] = Array.isArray(selectedTicket?.replies) ? selectedTicket.replies : [];
  const itForwards: any[] = Array.isArray(selectedTicket?.it_forwards) ? selectedTicket.it_forwards : [];
  const sendReply = async (kind: "reply" | "done", message: string) => {
    if (!selectedTicket) return;
    setSendingReply(true);
    try {
      const { data, error } = await supabase.functions.invoke("reply-it-ticket", {
        body: { ticket_id: selectedTicket.id, kind, message },
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      if (!data?.has_email) toast.warning("לעובד אין כתובת מייל — התגובה נשמרה בקריאה בלבד");
      else if (data?.emailed) toast.success(kind === "done" ? "נשלח לעובד מייל שהקריאה טופלה" : "התגובה נשלחה לעובד במייל");
      else toast.error("שליחת המייל לעובד נכשלה");
      if (kind === "reply") setReplyText("");
    } catch (e: any) {
      toast.error("שליחת התגובה נכשלה", { description: e?.message } as any);
    } finally {
      setSendingReply(false);
    }
  };

  /** Closing a ticket is confirmed in a dialog first; the status only changes when it's confirmed. */
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneNote, setDoneNote] = useState("");
  const [doneNotify, setDoneNotify] = useState(true);

  const applyStatus = async (ticket: any, status: string) => {
    const previous = ticket.status as string;
    await updateStatus.mutateAsync({ id: ticket.id, status });
    undoToast(status === "done" ? "הקריאה סומנה כטופלה" : `הסטטוס עודכן ל"${STATUS_LABELS[status] ?? status}"`, {
      onUndo: () => updateStatus.mutateAsync({ id: ticket.id, status: previous }),
    });
  };

  const changeStatus = async (status: string) => {
    if (!selectedTicket || status === selectedTicket.status) return;
    if (status === "done") {
      setDoneNote("");
      setDoneNotify(true);
      setDoneOpen(true);
      return;
    }
    try {
      await applyStatus(selectedTicket, status);
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בעדכון הסטטוס");
    }
  };

  const confirmDone = async () => {
    if (!selectedTicket) return;
    try {
      await applyStatus(selectedTicket, "done");
      setDoneOpen(false);
      if (doneNotify) await sendReply("done", doneNote.trim());
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בעדכון הסטטוס");
    }
  };

  const filtersActive = statusFilter !== "open_all" || forwardFilter !== "any";
  const clearFilters = () => { setStatusFilter("open_all"); setForwardFilter("any"); };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="page-title">קריאות שירות</h1>
          <p className="page-subtitle">קריאות עובדים בטיפול מחלקת התפעול</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" aria-label="סינון לפי סטטוס"><SelectValue /></SelectTrigger>
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
                  sla: t.sla_deadline ? formatDateTimeDMY(t.sla_deadline, "") : "",
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

      {isLoading || (ticketsError && !tickets) ? (
        <div className="bg-card rounded-xl border border-border/50">
          <StateView loading={isLoading} error={ticketsError} onRetry={() => { void refetchTickets(); }} label="את קריאות השירות">{null}</StateView>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)] gap-6">
          {/* Ticket list */}
          <div className={cn("space-y-2", selectedTicket && "hidden xl:block")}>
            <div className="flex flex-wrap gap-2 pb-1" role="group" aria-label="סינון לפי העברה לטיפול חיצוני">
              {([
                { value: "any", label: "הכל", classes: "border-border/60 text-muted-foreground", activeClasses: "bg-foreground text-background border-foreground" },
                { value: "it", label: "נשלח לאיש IT", classes: "border-info/40 text-info", activeClasses: "bg-info text-info-foreground border-info" },
                { value: "mesimon", label: "נשלח למשימון", classes: "border-success/40 text-success", activeClasses: "bg-success text-success-foreground border-success" },
                { value: "none", label: "ללא העברה", classes: "border-border/60 text-muted-foreground", activeClasses: "bg-muted-foreground text-background border-muted-foreground" },
              ] as const).map((chip) => {
                const active = forwardFilter === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForwardFilter(active && chip.value !== "any" ? "any" : chip.value)}
                    className={cn(
                      "inline-flex min-h-11 sm:min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? chip.activeClasses : cn("bg-background", chip.classes),
                    )}
                  >
                    {chip.label}
                    <span className="tabular-nums opacity-75">{forwardCount(chip.value)}</span>
                  </button>
                );
              })}
            </div>
            {filtered.map((ticket: any) => (
              <RowContextMenu key={ticket.id} actions={[
                { label: "פתח קריאה", onSelect: () => openVisibleTicket(ticket.id) },
                { label: "פתח תיק עובד", when: !!ticket.employee_id, roles: ["admin","super_admin","operations","direct_manager","payroll","hr","finance"], onSelect: () => navigate(`/employees/${ticket.employee_id}`) },
                copyAction("העתק מס' קריאה", ticket.ticket_code, true),
                copyAction("העתק כותרת", ticket.title),
              ]}>
              {/* The title is the row's button, stretched over the card; EmployeeLink sits above it as a sibling. */}
              <div
                className={cn(
                  "relative w-full text-right bg-card rounded-xl border p-4 transition-all hover:shadow-md focus-within:ring-2 focus-within:ring-ring",
                  ticket.ticket_type === "offboarding" ? "border-destructive/30" : "border-border/50",
                  selectedId === ticket.id && "ring-2 ring-primary",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{ticket.ticket_code}</span>
                      <span className={`text-[0.8125rem] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority] ?? ""}`}>
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </span>
                      <span className={cn("text-[0.8125rem] px-1.5 py-0.5 rounded-full border", STATUS_CLASSES[ticket.status])}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      {Array.isArray(ticket.it_forwards) && ticket.it_forwards.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/30" title="הקריאה נשלחה לאיש IT לטיפול">
                          <Send className="w-3 h-3" aria-hidden="true" />
                          נשלח לאיש IT
                        </span>
                      )}
                      {ticket.mesimon_task_id && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30" title="הקריאה הפכה למשימה במשימון">
                          <ListTodo className="w-3 h-3" aria-hidden="true" />
                          נשלח למשימון
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openVisibleTicket(ticket.id)}
                      aria-current={selectedId === ticket.id ? "true" : undefined}
                      className="block w-full truncate text-right text-sm font-medium focus:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                    >
                      {ticket.title}
                    </button>
                    <p className="text-xs text-muted-foreground mt-1">
                      {subjectLabel(ticket.subject_category ?? ticket.ticket_type)} ·{" "}
                      <span className="relative z-10"><EmployeeLink employeeId={ticket.employee_id} name={ticket.employees?.full_name} /></span>
                    </p>
                  </div>
                  {ticket.status === "done"
                    ? <CheckCircle2 className="w-5 h-5 text-success shrink-0" aria-hidden="true" />
                    : <SlaBadge deadline={ticket.sla_deadline} done={false} holidays={holidays} />}
                </div>
              </div>
              </RowContextMenu>
            ))}
            {filtered.length === 0 && (
              <StateView
                isEmpty
                empty={filtersActive
                  ? {
                      title: "אין קריאות שתואמות לסינון",
                      description: (tickets ?? []).length ? `יש ${(tickets ?? []).length} קריאות בסך הכל.` : undefined,
                      action: <Button variant="outline" onClick={clearFilters}>נקה סינון</Button>,
                    }
                  : (tickets ?? []).length
                    ? { title: "אין קריאות פתוחות", description: "כל הקריאות טופלו.", action: <Button variant="outline" onClick={() => setStatusFilter("all")}>הצג את כל הקריאות</Button> }
                    : { title: "עדיין אין קריאות שירות", description: "קריאות שעובדים פותחים בפורטל יופיעו כאן.", action: <Button variant="outline" onClick={() => setNewOpen(true)}>פתיחת קריאה</Button> }}
              >
                {null}
              </StateView>
            )}
          </div>

          {/* Detail */}
          <div className="min-w-0">
            {selectedTicket ? (
              <div id="ticket-details" className="bg-card rounded-xl border border-border/50 shadow-card animate-fade-in">
                <div className="p-5 border-b border-border/50">
                  <button type="button" onClick={() => setSelectedId(null)} className="xl:hidden flex items-center gap-1 min-h-11 text-sm text-muted-foreground mb-3">
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
                        {itForwards.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-info/10 text-info border border-info/30">
                            <Send className="w-3 h-3" aria-hidden="true" />
                            נשלח לאיש IT
                          </span>
                        )}
                        {selectedTicket.mesimon_task_id && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/30">
                            <ListTodo className="w-3 h-3" aria-hidden="true" />
                            נשלח למשימון
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-bold">{selectedTicket.title}</h2>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                        <User className="w-3.5 h-3.5" aria-hidden="true" />
                        <EmployeeLink employeeId={selectedTicket.employee_id} name={selectedTicket.employees?.full_name} className="font-medium" />
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-1">
                        <SlaBadge deadline={selectedTicket.sla_deadline} done={selectedTicket.status === "done"} holidays={holidays} />
                        {selectedTicket.status !== "done" && (
                          <button type="button" onClick={() => setSlaEditOpen(true)} className="text-sm px-3 min-h-11 sm:min-h-9 rounded-md border border-border hover:bg-muted flex items-center gap-1" title="עריכת יעד הטיפול">
                            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                            ערוך SLA
                          </button>
                        )}
                      </div>
                      <EditSlaDialog ticket={selectedTicket} open={slaEditOpen} onOpenChange={setSlaEditOpen} holidays={holidays} />
                      <button
                        type="button"
                        onClick={openSendToIT}
                        disabled={sendingIT}
                        className="text-sm px-3 min-h-11 sm:min-h-9 rounded-md border border-border hover:bg-muted flex items-center gap-1 disabled:opacity-50"
                        title="שליחת הקריאה במייל לאנשי ה-IT שהוגדרו לחברה"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        {sendingIT ? "שולח..." : "שלח לאיש IT"}
                      </button>
                      <SendToMesimonButton ticket={selectedTicket} />
                      <Select value={selectedTicket.status} onValueChange={(v) => { void changeStatus(v); }} disabled={updateStatus.isPending}>
                        <SelectTrigger className="w-36 min-h-11 sm:min-h-10" aria-label="סטטוס הקריאה" aria-busy={updateStatus.isPending || undefined}><SelectValue /></SelectTrigger>
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
                      נפתחה: {formatDateTimeDMY(selectedTicket.created_at)}
                    </p>
                    {selectedTicket.sla_deadline && (
                      <p className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        יעד טיפול: {formatDateTimeDMY(selectedTicket.sla_deadline)}
                      </p>
                    )}
                  </div>

                  {itForwards.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                        <Send className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        העברות לטיפול חיצוני
                      </h3>
                      <ul className="space-y-2">
                        {itForwards.map((f: any, i: number) => (
                          <li key={i} className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
                            <p className="flex flex-wrap items-center gap-1">
                              <span className="font-medium">
                                {f.target === "mesimon" ? "נשלח למשימון" : "נשלח לאיש IT"} ב-{formatDateTimeDMY(f.at)} על ידי {f.by_name || "—"}
                              </span>
                              {f.sent > 0 && f.target !== "mesimon" && <span className="text-xs text-muted-foreground">({f.sent} נמענים)</span>}
                            </p>
                            {Array.isArray(f.recipients) && f.recipients.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1" dir="ltr">
                                {f.recipients.join(", ")}
                              </p>
                            )}
                            {f.note && <p className="text-sm mt-1">הערה: {f.note}</p>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

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

                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">תגובות לעובד</h3>
                    {replies.length > 0 && (
                      <ul className="space-y-2">
                        {replies.map((r: any) => (
                          <li key={r.id} className="rounded-lg border border-border/50 bg-muted/30 p-3 text-sm">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>{r.author}{r.kind === "done" ? " • הודעת טיפול" : ""}</span>
                              <span>{formatDateTimeDMY(r.created_at)} • {r.emailed ? "נשלח במייל" : "לא נשלח במייל"}</span>
                            </div>
                            {r.message && <p className="whitespace-pre-wrap">{r.message}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="כתוב תגובה לעובד..."
                      aria-label="תגובה לעובד"
                      rows={3}
                    />
                    <Button disabled={!replyText.trim()} loading={sendingReply} loadingText="שולח…" onClick={() => sendReply("reply", replyText)}>
                      שלח תגובה לעובד במייל
                    </Button>
                  </div>

                  {attachments.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-1">קבצים מצורפים</h3>
                      <ul className="space-y-1">
                        {attachments.map((a, i) => (
                          <li key={i}>
                            <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm text-primary hover:underline">
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
              <div className="hidden xl:block bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
                <Wrench className="w-12 h-12 mx-auto mb-4 opacity-20" aria-hidden="true" />
                <p className="font-medium">בחר קריאה מהרשימה</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Replaces window.prompt: optional note for the IT contacts. */}
      <Dialog open={itNoteOpen} onOpenChange={(v) => { if (!sendingIT) setItNoteOpen(v); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>שליחת הקריאה לאיש IT</DialogTitle>
            <DialogDescription>הקריאה תישלח במייל לאנשי ה-IT שהוגדרו לחברה.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="it-note">הערה לאיש ה-IT (לא חובה)</Label>
            <Textarea id="it-note" value={itNote} onChange={(e) => setItNote(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setItNoteOpen(false)} disabled={sendingIT}>ביטול</Button>
            <Button onClick={sendToIT} loading={sendingIT} loadingText="שולח…">
              <Send aria-hidden="true" /> שלח לאיש IT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Replaces window.prompt: the status changes to "טופלה" only after this is confirmed. */}
      <Dialog open={doneOpen} onOpenChange={(v) => { if (!updateStatus.isPending && !sendingReply) setDoneOpen(v); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>לסמן את הקריאה כטופלה?</DialogTitle>
            <DialogDescription>{selectedTicket ? `${selectedTicket.ticket_code ?? ""} · ${selectedTicket.title}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox id="done-notify" checked={doneNotify} onCheckedChange={(v) => setDoneNotify(v === true)} />
              <Label htmlFor="done-notify" className="cursor-pointer">שלח לעובד מייל שהקריאה טופלה</Label>
            </div>
            {doneNotify && (
              <div className="space-y-1.5">
                <Label htmlFor="done-note">הודעה לעובד (לא חובה)</Label>
                <Textarea id="done-note" value={doneNote} onChange={(e) => setDoneNote(e.target.value)} rows={3} placeholder="למשל: החלפנו את המטען, אפשר לאסוף מהמשרד" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDoneOpen(false)} disabled={updateStatus.isPending}>ביטול</Button>
            <Button onClick={confirmDone} loading={updateStatus.isPending || sendingReply} loadingText="מעדכן…">
              <CheckCircle2 aria-hidden="true" /> סמן כטופלה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
