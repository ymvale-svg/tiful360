import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyHolidaySet } from "@/hooks/useCompanyHolidays";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronLeft, Mail, FileDown, Check, X, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  monthWorkingDays, buildReviewDays, isGapDay, LEAVE_TYPE_LABEL,
  type ReviewDay, type MonthPunch, type ApprovedLeave,
} from "@/lib/attendanceMonth";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const ABSENCE_TYPES = ["vacation", "sick", "reserve", "training", "unpaid", "personal"] as const;

const fmtDate = (k: string) => { const [y, m, d] = k.split("-"); return `${d}/${m}/${y}`; };
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const dow = (k: string) => { const [y, m, d] = k.split("-").map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };
const hhmm = (s?: string | null) => (s ? String(s).slice(0, 5) : "");

function monthOptions() {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function MonthlyAttendanceReview() {
  const { activeCompanyId } = useCompany();
  const { isPayroll, isSuperAdmin, hasRole } = useAuth() as any;
  const canApprove = isPayroll || isSuperAdmin || hasRole?.("admin");
  const holidays = useCompanyHolidaySet();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [month, setMonth] = useState(monthOptions()[0]);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  const days = useMemo(() => monthWorkingDays(y, m, holidays), [y, m, holidays]);

  const enabled = !!activeCompanyId;
  const { data: employees = [] } = useQuery({
    queryKey: ["mar-emps", activeCompanyId], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id, full_name, employee_code, department, email, tracks_attendance, status")
        .eq("company_id", activeCompanyId!).in("status", ["active", "onboarding", "leaving"]).order("full_name");
      if (error) throw error;
      return (data ?? []).filter((e: any) => e.tracks_attendance !== false);
    },
  });
  const { data: punches = [] } = useQuery({
    queryKey: ["attendance_punches", "mar", activeCompanyId, month], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_punches")
        .select("id, employee_id, punch_at, direction")
        .eq("company_id", activeCompanyId!).neq("status", "rejected")
        .gte("punch_at", new Date(y, m - 1, 1).toISOString()).lt("punch_at", new Date(y, m, 1).toISOString())
        .order("punch_at");
      if (error) throw error;
      return (data ?? []) as MonthPunch[];
    },
  });
  const { data: leaves = [] } = useQuery({
    queryKey: ["mar-leaves", activeCompanyId, month], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("leave_requests")
        .select("employee_id, request_type, start_date, end_date")
        .eq("company_id", activeCompanyId!).eq("status", "approved")
        .lte("start_date", to).or(`end_date.gte.${from},end_date.is.null`);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: corrections = [] } = useQuery({
    queryKey: ["attendance-corrections", "mar", activeCompanyId, month], enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_corrections")
        .select("id, employee_id, correction_date, requested_check_in, requested_check_out, reason, status")
        .eq("company_id", activeCompanyId!).eq("status", "pending")
        .gte("correction_date", from).lte("correction_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rowsByEmp = useMemo(() => {
    const map = new Map<string, ReviewDay[]>();
    for (const e of employees as any[]) {
      map.set(e.id, buildReviewDays(
        days,
        punches.filter((p) => p.employee_id === e.id),
        (leaves as any[]).filter((l) => l.employee_id === e.id) as ApprovedLeave[],
      ));
    }
    return map;
  }, [employees, punches, leaves, days]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["attendance_punches"] });
    qc.invalidateQueries({ queryKey: ["mar-leaves"] });
    qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); refresh(); }
    catch (e: any) { toast({ title: "שגיאה", description: e.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const setTime = (emp: any, day: string, dir: "in" | "out", punch: MonthPunch | null, time: string) =>
    run(async () => {
      const [h, mi] = time.split(":").map(Number);
      const [yy, mm, dd] = day.split("-").map(Number);
      const iso = new Date(yy, mm - 1, dd, h, mi).toISOString();
      if (punch) {
        const { error } = await supabase.rpc("admin_edit_punch_time" as any, { _punch_id: punch.id, _new_punch_at: iso });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_punches").insert({
          company_id: activeCompanyId!, employee_id: emp.id, employee_code_raw: emp.employee_code ?? "",
          punch_at: iso, direction: dir, source: "manual", status: "approved",
        } as any);
        if (error) throw error;
      }
    }, "השעה נשמרה");

  const markAbsence = (emp: any, day: string, type: string) =>
    run(async () => {
      const { error } = await supabase.from("leave_requests").insert({
        company_id: activeCompanyId!, employee_id: emp.id, request_type: type as any,
        start_date: day, end_date: day, total_days: 1, status: "approved",
        reason: "עודכן ידנית בדוח הנוכחות החודשי",
      } as any);
      if (error) throw error;
    }, `סומן: ${LEAVE_TYPE_LABEL[type]}`);

  const review = (ids: string[], approve: boolean) =>
    run(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("attendance_corrections").update({
        status: approve ? "approved" : "rejected", reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString(),
      }).in("id", ids);
      if (error) throw error;
    }, approve ? "הבקשות אושרו" : "הבקשות נדחו");

  const sendEmail = (ids: string[]) =>
    run(async () => {
      const { data, error } = await supabase.functions.invoke("send-attendance-gaps", {
        body: { company_id: activeCompanyId, from, to, employee_ids: ids },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    }, "הדוח נשלח במייל");

  const exportPdf = (ids: string[]) => {
    const w = window.open("", "_blank");
    if (!w) return;
    const emps = (employees as any[]).filter((e) => ids.includes(e.id));
    const pages = emps.map((e) => {
      const rows = rowsByEmp.get(e.id) ?? [];
      const gaps = rows.filter(isGapDay).length;
      const abs = rows.filter((r) => r.status === "leave").length;
      const tr = rows.map((r) => `<tr class="${isGapDay(r) ? "gap" : ""}"><td>${fmtDate(r.day)}</td><td>${dow(r.day)}</td>
        <td>${fmtTime(r.inPunch?.punch_at)}</td><td>${fmtTime(r.outPunch?.punch_at)}</td>
        <td>${r.leave ?? (r.status === "missing" ? "לא החתים" : r.status === "partial" ? "חסרה החתמה" : "")}</td></tr>`).join("");
      return `<section><h1>דוח נוכחות – ${month.split("-").reverse().join("/")}</h1>
        <div class="meta"><b>${e.full_name}</b> · מספר עובד: ${e.employee_code ?? "—"} · מחלקה: ${e.department ?? "—"}</div>
        <div class="meta">ימי עבודה: ${rows.length} · היעדרויות: ${abs} · ימים חסרים: ${gaps}</div>
        <table><thead><tr><th>תאריך</th><th>יום</th><th>כניסה</th><th>יציאה</th><th>הערה</th></tr></thead><tbody>${tr}</tbody></table></section>`;
    }).join("");
    w.document.write(`<html dir="rtl" lang="he"><head><title>דוח נוכחות ${month}</title><style>
      body{font-family:Arial,sans-serif;margin:0} section{page-break-after:always;padding:16px}
      h1{text-align:center;font-size:20px} .meta{margin:4px 0;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px} th,td{border:1px solid #ccc;padding:4px 6px;text-align:right}
      th{background:#eef} tr.gap td{background:#fff36b} @page{size:A4;margin:12mm}
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${pages}</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const allIds = (employees as any[]).map((e) => e.id);
  const selIds = [...selected];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Card dir="rtl">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">דוח נוכחות חודשי – בדיקה ותיקון</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions().map((o) => <SelectItem key={o} value={o}>{o.split("-").reverse().join("/")}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={!selIds.length || busy} onClick={() => sendEmail(selIds)}>
            <Mail className="w-4 h-4 ml-1" />שלח במייל למסומנים ({selIds.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportPdf(selIds.length ? selIds : allIds)}>
            <FileDown className="w-4 h-4 ml-1" />ייצוא PDF {selIds.length ? "למסומנים" : "לכולם"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 w-8"><Checkbox aria-label="סמן הכול" checked={selIds.length > 0 && selIds.length === allIds.length}
                onCheckedChange={(v) => setSelected(v ? new Set(allIds) : new Set())} /></th>
              <th className="p-2 text-right">עובד</th><th className="p-2 text-right">מספר</th>
              <th className="p-2 text-right">ימים חסרים</th><th className="p-2 text-right">היעדרויות</th><th className="p-2 text-right">בקשות תיקון</th>
            </tr>
          </thead>
          <tbody>
            {(employees as any[]).map((e) => {
              const rows = rowsByEmp.get(e.id) ?? [];
              const gaps = rows.filter(isGapDay).length;
              const pend = (corrections as any[]).filter((c) => c.employee_id === e.id);
              const isOpen = open === e.id;
              const shown = onlyGaps ? rows.filter((r) => isGapDay(r) || pend.some((c) => c.correction_date === r.day)) : rows;
              return (
                <Fragment key={e.id}>
                  <tr className={cn("border-t cursor-pointer hover:bg-muted/30", isOpen && "bg-muted/40")} onClick={() => setOpen(isOpen ? null : e.id)}>
                    <td className="p-2" onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox aria-label={`סמן ${e.full_name}`} checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    </td>
                    <td className="p-2 font-medium">
                      {isOpen ? <ChevronDown className="inline w-4 h-4 ml-1" /> : <ChevronLeft className="inline w-4 h-4 ml-1" />}{e.full_name}
                    </td>
                    <td className="p-2">{e.employee_code ?? "—"}</td>
                    <td className="p-2">{gaps ? <Badge variant="destructive">{gaps}</Badge> : <Badge variant="secondary">0</Badge>}</td>
                    <td className="p-2">{rows.filter((r) => r.status === "leave").length}</td>
                    <td className="p-2">{pend.length ? <Badge>{pend.length} ממתינות</Badge> : "—"}</td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={6} className="p-3 bg-muted/20">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <label className="flex items-center gap-1 text-sm"><Checkbox checked={onlyGaps} onCheckedChange={(v) => setOnlyGaps(!!v)} />רק חוסרים</label>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => sendEmail([e.id])}><Mail className="w-4 h-4 ml-1" />שלח לעובד במייל</Button>
                        <Button size="sm" variant="outline" onClick={() => exportPdf([e.id])}><FileDown className="w-4 h-4 ml-1" />PDF</Button>
                        {canApprove && pend.length > 0 && <>
                          <Button size="sm" disabled={busy} onClick={() => review(pend.map((c) => c.id), true)}><Check className="w-4 h-4 ml-1" />אשר את כל הבקשות</Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => review(pend.map((c) => c.id), false)}><X className="w-4 h-4 ml-1" />דחה הכול</Button>
                        </>}
                      </div>
                      <table className="w-full text-sm bg-card rounded">
                        <thead><tr className="text-muted-foreground"><th className="p-1 text-right">תאריך</th><th className="p-1 text-right">יום</th>
                          <th className="p-1 text-right">כניסה</th><th className="p-1 text-right">יציאה</th><th className="p-1 text-right">מצב / סיבה</th><th className="p-1 text-right">פעולות</th></tr></thead>
                        <tbody>
                          {shown.map((r) => (
                            <DayRow key={r.day} r={r} emp={e} pending={pend.filter((c) => c.correction_date === r.day)}
                              busy={busy} canApprove={canApprove} onTime={setTime} onAbsence={markAbsence} onReview={review} />
                          ))}
                          {!shown.length && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">אין חוסרים החודש</td></tr>}
                        </tbody>
                      </table>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DayRow({ r, emp, pending, busy, canApprove, onTime, onAbsence, onReview }: any) {
  const [inT, setInT] = useState(fmtTime(r.inPunch?.punch_at));
  const [outT, setOutT] = useState(fmtTime(r.outPunch?.punch_at));
  const gap = isGapDay(r);
  const changed = inT !== fmtTime(r.inPunch?.punch_at) || outT !== fmtTime(r.outPunch?.punch_at);
  const save = async () => {
    if (inT && inT !== fmtTime(r.inPunch?.punch_at)) await onTime(emp, r.day, "in", r.inPunch, inT);
    if (outT && outT !== fmtTime(r.outPunch?.punch_at)) await onTime(emp, r.day, "out", r.outPunch, outT);
  };
  return (
    <>
      <tr className={cn("border-t", gap && "bg-destructive/15")}>
        <td className="p-1">{fmtDate(r.day)}</td><td className="p-1">{dow(r.day)}</td>
        <td className="p-1"><Input type="time" className="h-8 w-28" value={inT} onChange={(e) => setInT(e.target.value)} aria-label="כניסה" /></td>
        <td className="p-1"><Input type="time" className="h-8 w-28" value={outT} onChange={(e) => setOutT(e.target.value)} aria-label="יציאה" /></td>
        <td className="p-1">
          {r.leave ? <Badge variant="secondary">{r.leave}</Badge>
            : r.status === "missing" ? <span className="text-destructive font-medium">לא החתים</span>
            : r.status === "partial" ? <span className="text-destructive font-medium">חסרה החתמה</span>
            : <span className="text-muted-foreground">תקין</span>}
        </td>
        <td className="p-1">
          <div className="flex items-center gap-1">
            {changed && <Button size="sm" disabled={busy} onClick={save}><Save className="w-4 h-4 ml-1" />שמור</Button>}
            {gap && (
              <Select onValueChange={(v) => onAbsence(emp, r.day, v)}>
                <SelectTrigger className="h-8 w-32"><SelectValue placeholder="סמן היעדרות" /></SelectTrigger>
                <SelectContent>{ABSENCE_TYPES.map((t) => <SelectItem key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        </td>
      </tr>
      {pending.map((c: any) => (
        <tr key={c.id} className="bg-primary/5">
          <td colSpan={5} className="p-1 text-xs">
            <b>בקשת תיקון:</b> כניסה {hhmm(c.requested_check_in) || "—"} · יציאה {hhmm(c.requested_check_out) || "—"} · נימוק: {c.reason ?? "—"}
          </td>
          <td className="p-1">
            {canApprove && <div className="flex gap-1">
              <Button size="sm" disabled={busy} onClick={() => onReview([c.id], true)}><Check className="w-4 h-4" />אשר</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onReview([c.id], false)}><X className="w-4 h-4" />דחה</Button>
            </div>}
          </td>
        </tr>
      ))}
    </>
  );
}
