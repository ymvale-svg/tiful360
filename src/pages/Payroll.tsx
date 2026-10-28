import { Fragment, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Wallet, FileText, Stethoscope, Calendar, Clock4, Upload, LayoutDashboard, FolderOpen, Settings as SettingsIcon, Save, Mail, Paperclip, AlertCircle, ClipboardList, UserPlus, MapPin, ChevronRight, FileDown, ExternalLink, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PayslipsUploadDialog } from "@/components/PayslipsUploadDialog";
import { getPayslipSignedUrl, usePayslipBatches, useUnmatchedPayslips, useBatchPayslips, useDeletePayslip, useDeleteBatch } from "@/hooks/usePayslips";
import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useEmployees } from "@/hooks/useData";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Tax101AdminTab } from "@/components/payroll/Tax101AdminTab";
import { AttendanceClockTab } from "@/components/payroll/AttendanceClockTab";
import { MonthlyAttendanceReview } from "@/components/payroll/MonthlyAttendanceReview";
import { MichpalExportCard } from "@/components/payroll/MichpalExportCard";
import { IconButton } from "@/components/feedback/IconButton";
import { StateView } from "@/components/feedback/StateView";
import { FormField } from "@/components/feedback/FormField";
import { Input } from "@/components/ui/input";
import { PayslipAssignConfirmDialog, type PendingPayslipAssign } from "@/components/payroll/PayslipAssignConfirmDialog";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const TYPE_LABELS_PAYROLL: Record<string, string> = { vacation: "חופשה", sick: "מחלה", reserve: "מילואים", personal: "יום אישי", other: "אחר" };

type HubTile = {
  key: string;
  label: string;
  description: string;
  icon: typeof Wallet;
  to?: string;
  roles?: string[];
};

const HUB_TILES: HubTile[] = [
  { key: "overview", label: "סקירה", description: "תלושים אחרונים, מחלות, חופשות ותיקוני נוכחות", icon: LayoutDashboard },
  { key: "reports", label: "דוחות נוכחות וחוסרים", description: "דוח חודשי מרוכז: חוסרים, היעדרויות, בקשות תיקון, מייל ו-PDF", icon: ClipboardList },
  { key: "attendance", label: "שעוני נוכחות", description: "החתמות, שעונים פיזיים והחתמות ללא שיוך", icon: Clock4 },
  { key: "michpal", label: "ייצוא למיכפל", description: "ייצוא נתוני נוכחות חודשיים לקובץ קליטה במיכפל (CSV)", icon: FileDown, roles: ["admin", "super_admin", "payroll", "hr"] },
  { key: "onboarding", label: "קליטת עובדים", description: "תהליכי קליטה, טופס צרכים וצ'קליסט תפעול", icon: UserPlus, to: "/onboarding", roles: ["admin", "super_admin", "operations", "it_manager", "hr"] },
  { key: "map", label: "מפת נוכחות חיה", description: "מיקומי GPS של עובדים שהחתימו היום", icon: MapPin, to: "/attendance-map", roles: ["admin", "super_admin", "payroll", "hr", "direct_manager"] },
  { key: "tax101", label: "טפסי עובדים", description: "ניהול טפסי 101 ואישורים", icon: FileText },
  { key: "batches", label: "ניהול תלושים", description: "העלאת אצוות תלושים ושיוך אוטומטי", icon: FolderOpen, roles: ["admin", "super_admin", "payroll"] },
  { key: "settings", label: "הגדרות שכר", description: "כתובות דיווח, דוחות אוטומטיים והרצה ידנית", icon: SettingsIcon, roles: ["admin", "super_admin", "payroll", "hr"] },
];

/** Batch status in Hebrew with an icon, so it never reads as a raw DB value or colour only. */
function BatchStatusBadge({ batch }: { batch: any }) {
  const base = "inline-flex items-center gap-1 text-[0.8125rem] px-2 py-0.5 rounded-full whitespace-nowrap";
  if (batch.status === "done" && Number(batch.failed_count ?? 0) > 0) {
    return <span className={`${base} bg-warning/10 text-warning`}><AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />הושלם עם שגיאות</span>;
  }
  if (batch.status === "done") {
    return <span className={`${base} bg-success/10 text-success`}><CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />הושלם</span>;
  }
  if (batch.status === "processing") {
    return <span className={`${base} bg-info/10 text-info`}><Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />בעיבוד</span>;
  }
  if (batch.status === "failed") {
    return <span className={`${base} bg-destructive/10 text-destructive`}><XCircle className="w-3.5 h-3.5" aria-hidden="true" />נכשל</span>;
  }
  return <span className={`${base} bg-muted`}>{batch.status ?? "—"}</span>;
}

/** Hebrew error for a comma-separated list of addresses, or null when every address looks valid. */
function emailListError(value: string): string | null {
  const invalid = value.split(",").map((s) => s.trim()).filter(Boolean).filter((e) => !/^\S+@\S+\.\S+$/.test(e));
  return invalid.length ? `כתובות לא תקינות: ${invalid.join(", ")}` : null;
}

export default function Payroll() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { roles } = useAuth();
  const tab = searchParams.get("tab");
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const setTab = (v: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("tab", v);
    else next.delete("tab");
    setSearchParams(next);
  };

  const visibleTiles = HUB_TILES.filter(
    (t) => !t.roles || t.roles.some((r) => roles.includes(r as any)),
  );
  const active = visibleTiles.find((t) => t.key === tab && !t.to);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          משאבי אנוש
        </h1>
        <p className="page-subtitle">
          {active ? active.description : `דשבורד משאבי אנוש וחשבות שכר — ${MONTHS[currentMonth - 1]} ${currentYear}`}
        </p>
      </div>

      {!active ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTiles.map((tile) => {
            const inner = (
              <>
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <tile.icon className="w-7 h-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-base leading-tight">{tile.label}</h2>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{tile.description}</p>
                  {tile.to && (
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      פתיחה במסך נפרד
                    </span>
                  )}
                </div>
              </>
            );
            const cls =
              "group text-right bg-card rounded-xl border border-border/50 shadow-card p-5 min-h-[132px] flex items-start gap-4 hover:border-primary/40 hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
            return tile.to ? (
              <Link key={tile.key} to={tile.to} className={`${cls} border-dashed`}>
                {inner}
              </Link>
            ) : (
              <button key={tile.key} type="button" onClick={() => setTab(tile.key)} className={cls}>
                {inner}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTab(null)}>
            <ChevronRight className="w-4 h-4" />
            חזרה למשאבי אנוש
          </Button>

          <h2 className="text-lg font-semibold flex items-center gap-2">
            <active.icon className="w-5 h-5 text-primary" />
            {active.label}
          </h2>

          {active.key === "overview" && <OverviewTab />}
          {active.key === "reports" && <div className="space-y-4"><MonthlyAttendanceReview /></div>}
          {active.key === "michpal" && <MichpalExportCard />}
          {active.key === "attendance" && <AttendanceClockTab />}
          {active.key === "tax101" && <Tax101AdminTab />}
          {active.key === "batches" && <BatchesManagementTab />}
          {active.key === "settings" && <PayrollSettingsTab />}
        </div>
      )}
    </div>
  );
}


// ============================
// Payroll Settings Tab
// ============================
function PayrollSettingsTab() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [payrollEmails, setPayrollEmails] = useState("");
  const [hrEmails, setHrEmails] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [hrError, setHrError] = useState<string | null>(null);
  const [payrollError, setPayrollError] = useState<string | null>(null);
  const [sendingReport, setSendingReport] = useState<string | null>(null);

  const { data: companyFull } = useQuery({
    queryKey: ["company-full", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data } = await supabase.rpc("get_company_routing_emails", { _company_id: activeCompanyId });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!activeCompanyId,
  });

  useEffect(() => {
    if (companyFull && !loaded) {
      setPayrollEmails((companyFull as any).payroll_emails ?? "");
      setHrEmails((companyFull as any).hr_emails ?? "");
      setLoaded(true);
    }
  }, [companyFull, loaded]);

  const saveEmails = async (column: "payroll_emails" | "hr_emails", value: string) => {
    if (!activeCompanyId) throw new Error("לא נבחרה חברה");
    const emailsList = value.split(",").map((s) => s.trim()).filter(Boolean);
    const invalidMsg = emailListError(value);
    if (invalidMsg) {
      (column === "hr_emails" ? setHrError : setPayrollError)(invalidMsg);
      throw new Error(invalidMsg);
    }
    const { error } = await supabase.rpc("set_company_routing_emails", {
      _company_id: activeCompanyId,
      _column: column,
      _emails: emailsList.length > 0 ? emailsList.join(",") : "",
    });
    if (error) throw error;
  };

  const updatePayrollMutation = useMutation({
    mutationFn: () => saveEmails("payroll_emails", payrollEmails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-full"] });
      toast({ title: "כתובות חשבות שכר נשמרו" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  const updateHrMutation = useMutation({
    mutationFn: () => saveEmails("hr_emails", hrEmails),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-full"] });
      toast({ title: "כתובות משאבי אנוש נשמרו" });
    },
    onError: (err: any) => toast({ title: "שגיאה", description: err.message, variant: "destructive" }),
  });

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  const runReport = async (fn: "send-hr-daily-missing" | "send-hr-weekly-gaps" | "send-unmatched-weekly" | "send-payroll-monthly-gaps") => {
    // One run per report at a time: a second click would mail the same report twice.
    if (!activeCompanyId || sendingReport === fn) return;
    setSendingReport(fn);
    try {
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { company_id: activeCompanyId },
      });
      if (error) throw error;
      toast({
        title: "הדוח נשלח",
        description: `נשלחו ${data?.queued ?? 0} מיילים.`,
      });
    } catch (e: any) {
      toast({ title: "שגיאה בשליחת הדוח", description: e.message, variant: "destructive" });
    } finally {
      setSendingReport(null);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">כתובות אימייל משאבי אנוש</h3>
        </div>
        <div>
          <FormField
            label="כתובות אימייל"
            error={hrError}
            hint={<>הדוחות היומי והשבועי של החתמות נוכחות יישלחו לכתובות אלו בלבד. משאבי אנוש וחשבות שכר הם משתמשים נפרדים. אפשר להזין כמה כתובות מופרדות בפסיק.</>}
          >
            <Input
              id="hr-emails"
              type="text"
              value={hrEmails}
              onChange={(e) => { setHrEmails(e.target.value); if (hrError) setHrError(null); }}
              onBlur={() => setHrError(emailListError(hrEmails))}
              placeholder="hr@company.com"
              className="font-mono"
              dir="ltr"
            />
          </FormField>

        </div>
        <Button className="gap-1.5" onClick={() => updateHrMutation.mutate()} disabled={updateHrMutation.isPending}>
          <Save className="w-4 h-4" />
          {updateHrMutation.isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">כתובות אימייל חשבות שכר</h3>
        </div>
        <div>
          <FormField
            label="כתובות אימייל"
            error={payrollError}
            hint={<>אישורי חופשה/מחלה, טפסי 101, הדוח השבועי של החתמות ללא שיוך והדוח החודשי של כלל החוסרים יישלחו לכתובות אלו. אפשר להזין כמה כתובות מופרדות בפסיק.</>}
          >
            <Input
              id="payroll-emails"
              type="text"
              value={payrollEmails}
              onChange={(e) => { setPayrollEmails(e.target.value); if (payrollError) setPayrollError(null); }}
              onBlur={() => setPayrollError(emailListError(payrollEmails))}
              placeholder="payroll@company.com"
              className="font-mono"
              dir="ltr"
            />
          </FormField>

        </div>
        <Button className="gap-1.5" onClick={() => updatePayrollMutation.mutate()} disabled={updatePayrollMutation.isPending}>
          <Save className="w-4 h-4" />
          {updatePayrollMutation.isPending ? "שומר..." : "שמור שינויים"}
        </Button>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">דוחות אוטומטיים</h3>
        </div>
        <ul className="text-sm text-muted-foreground list-disc pr-5 space-y-1">
          <li><strong>למשאבי אנוש</strong> — יומי בשעה 12:00: עובדים שלא החתימו היום ולא הגישו חופשה/מחלה (כולל קובץ Excel).</li>
          <li><strong>למשאבי אנוש</strong> — יום חמישי בשעה 14:00: קובץ Excel של כלל החוסרים ב-7 הימים האחרונים.</li>
          <li><strong>לחשבות שכר</strong> — יום חמישי בשעה 14:00: החתמות ללא שיוך לכרטיס עובד (מרוכז לכלל השבוע).</li>
          <li><strong>לחשבות שכר</strong> — 1 בכל חודש בבוקר: קובץ Excel של כלל חוסרי ההחתמה של החודש הקודם.</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" className="gap-1.5" loading={sendingReport === "send-hr-daily-missing"} loadingText="שולח…" onClick={() => runReport("send-hr-daily-missing")}>
            <Mail className="w-4 h-4" />
            שלח דוח יומי עכשיו
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" loading={sendingReport === "send-hr-weekly-gaps"} loadingText="שולח…" onClick={() => runReport("send-hr-weekly-gaps")}>
            <FileText className="w-4 h-4" />
            שלח דוח שבועי (אקסל) עכשיו
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" loading={sendingReport === "send-unmatched-weekly"} loadingText="שולח…" onClick={() => runReport("send-unmatched-weekly")}>
            <AlertCircle className="w-4 h-4" />
            שלח דוח החתמות ללא שיוך
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" loading={sendingReport === "send-payroll-monthly-gaps"} loadingText="שולח…" onClick={() => runReport("send-payroll-monthly-gaps")}>
            <FileText className="w-4 h-4" />
            שלח דוח חודשי לחשבות שכר
          </Button>
        </div>

      </div>
    </div>
  );
}

// ============================
// Overview Tab (existing content)
// ============================
function OverviewTab() {
  const { activeCompanyId } = useCompany();
  const [uploadOpen, setUploadOpen] = useState(false);

  const batchesQuery = useQuery({
    queryKey: ["payroll-batches-recent", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("payslip_batches")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });
  const monthBatches = batchesQuery.data ?? [];

  const { data: sickRequests = [] } = useQuery({
    queryKey: ["payroll-sick", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, department)")
        .eq("company_id", activeCompanyId)
        .eq("request_type", "sick")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: approvedLeaves = [] } = useQuery({
    queryKey: ["payroll-approved-leaves", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase
        .from("leave_requests")
        .select("*, employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, department)")
        .eq("company_id", activeCompanyId)
        .eq("status", "approved")
        .neq("request_type", "sick")
        .order("reviewed_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  const { data: corrections = [] } = useQuery({
    queryKey: ["payroll-corrections", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase
        .from("attendance_corrections")
        .select("*, employee:employees!attendance_corrections_employee_id_fkey(full_name)")
        .eq("company_id", activeCompanyId)
        .eq("status", "approved")
        .order("reviewed_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

  return (
    <div className="space-y-6">


      {/* Payslip batches */}
      <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-auto">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            אצוות תלושים אחרונות
          </h2>
          <div className="flex items-center gap-3">
            <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4" />
              העלאת אצוות תלושים
            </Button>
            <Link to="/payroll?tab=batches" className="inline-flex min-h-10 items-center text-sm text-primary hover:underline">לניהול תלושים ←</Link>
          </div>
        </div>
        <StateView
          loading={batchesQuery.isLoading}
          error={batchesQuery.error}
          onRetry={() => batchesQuery.refetch()}
          label="אצוות תלושים"
          isEmpty={monthBatches.length === 0}
          empty={{
            title: "טרם הועלו אצוות תלושים",
            description: "העלו את קובץ ה-PDF המאוחד של החודש, והמערכת תפצל אותו לעובדים.",
            action: (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
                <Upload className="w-4 h-4" />
                העלה אצווה ראשונה
              </Button>
            ),
          }}
        >
          <table className="data-table">
            <thead>
              <tr><th>תקופה</th><th>קובץ</th><th>סה"כ</th><th>זוהו</th><th>לא זוהו</th><th>סטטוס</th></tr>
            </thead>
            <tbody>
              {monthBatches.map((b: any) => (
                <tr key={b.id}>
                  <td>{MONTHS[b.period_month - 1]} {b.period_year}</td>
                  <td className="text-xs text-muted-foreground">{b.original_filename ?? "—"}</td>
                  <td className="font-mono">{b.total_pages}</td>
                  <td className="font-mono text-success">{b.matched_count}</td>
                  <td className="font-mono text-warning">{b.unmatched_count}</td>
                  <td><BatchStatusBadge batch={b} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </StateView>
      </section>

      <PayslipsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-info" />
              הצהרות מחלה
            </h2>
          </div>
          {sickRequests.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">אין הצהרות מחלה</div>
          ) : (
            <div className="divide-y divide-border/40">
              {sickRequests.map((r: any) => (
                <div key={r.id} className="p-3 text-sm space-y-1.5">
                  <p className="font-medium">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.total_days} ימים • {new Date(r.start_date).toLocaleDateString("en-GB")} – {new Date(r.end_date).toLocaleDateString("en-GB")}
                  </p>
                  {r.attachment_url && (
                    <Button asChild variant="outline" size="sm" className="gap-1">
                      <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                        <Paperclip className="w-3 h-3" aria-hidden="true" />
                        אישור מחלה
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
          <div className="p-4 border-b border-border/50">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-success" />
              חופשות מאושרות
            </h2>
          </div>
          {approvedLeaves.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">אין חופשות מאושרות חדשות</div>
          ) : (
            <div className="divide-y divide-border/40">
              {approvedLeaves.map((r: any) => (
                <div key={r.id} className="p-3 text-sm space-y-1.5">
                  <p className="font-medium">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABELS_PAYROLL[r.request_type] ?? r.request_type} • {r.total_days} ימים • {new Date(r.start_date).toLocaleDateString("en-GB")} – {new Date(r.end_date).toLocaleDateString("en-GB")}
                  </p>
                  {r.attachment_url && (
                    <Button asChild variant="outline" size="sm" className="gap-1">
                      <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                        <Paperclip className="w-3 h-3" aria-hidden="true" />
                        קובץ מצורף
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-auto">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock4 className="w-4 h-4 text-primary" />
            תיקוני שעון מאושרים
          </h2>
        </div>
        {corrections.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">אין תיקוני שעון מאושרים</div>
        ) : (
          <table className="data-table data-table-sm">
            <thead><tr><th>עובד</th><th>תאריך</th><th>מקורי</th><th>מתוקן</th></tr></thead>
            <tbody>
              {corrections.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.employee?.full_name}</td>
                  <td>{new Date(c.correction_date).toLocaleDateString("en-GB")}</td>
                  <td className="font-mono text-xs">{c.original_check_in?.slice(0, 5) ?? "—"} – {c.original_check_out?.slice(0, 5) ?? "—"}</td>
                  <td className="font-mono text-xs">{c.requested_check_in?.slice(0, 5) ?? "—"} – {c.requested_check_out?.slice(0, 5) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ============================
// Batches Management Tab
// ============================
function BatchesManagementTab() {
  const { activeCompanyId } = useCompany();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const confirm = useConfirm();
  const { data: batches, isLoading, error: batchesError, refetch: refetchBatches } = usePayslipBatches();
  const deleteBatch = useDeleteBatch();
  const { toast } = useToast();

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  const years = Array.from(new Set((batches ?? []).map((b: any) => b.period_year))).sort((a: any, b: any) => b - a);
  const filtered = (batches ?? []).filter((b: any) => {
    if (yearFilter !== "all" && String(b.period_year) !== yearFilter) return false;
    if (monthFilter !== "all" && String(b.period_month) !== monthFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">תלושי שכר חודשיים</h3>
              <p className="text-xs text-muted-foreground mt-0.5">העלאת קובץ PDF מאוחד ופיצול אוטומטי לעובדים לפי תעודת זהות</p>
            </div>
          </div>
          <Button className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Upload className="w-4 h-4" />
            העלאת אצוות תלושים חדשה
          </Button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            aria-label="סינון לפי שנה"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">כל השנים</option>
            {years.map((y: any) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            aria-label="סינון לפי חודש"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">כל החודשים</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div className="border border-border rounded-lg overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>תקופה</th>
                <th>קובץ</th>
                <th>סה"כ עמודים</th>
                <th>הותאמו</th>
                <th>לא הותאמו</th>
                <th>נכשלו</th>
                <th>סטטוס</th>
                <th>תאריך העלאה</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(isLoading || batchesError || filtered.length === 0) && (
                <tr>
                  <td colSpan={9} className="p-0">
                    <StateView
                      loading={isLoading}
                      error={batchesError}
                      onRetry={() => refetchBatches()}
                      label="אצוות תלושים"
                      isEmpty={filtered.length === 0}
                      empty={(batches ?? []).length > 0 ? {
                        title: "אין אצוות בתקופה שנבחרה",
                        description: "שנו את השנה או החודש כדי לראות אצוות אחרות.",
                        action: <Button size="sm" variant="outline" onClick={() => { setYearFilter("all"); setMonthFilter("all"); }}>נקה סינון</Button>,
                      } : {
                        title: "טרם הועלו אצוות תלושים",
                        action: <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}><Upload className="w-4 h-4" />העלאת אצוות תלושים</Button>,
                      }}
                    >
                      {null}
                    </StateView>
                  </td>
                </tr>
              )}
              {filtered.map((b: any) => (
                <Fragment key={b.id}>
                  <tr>
                    <td className="font-medium">{MONTHS[b.period_month - 1]} {b.period_year}</td>
                    <td className="text-xs text-muted-foreground">{b.original_filename ?? "—"}</td>
                    <td className="font-mono">{b.total_pages}</td>
                    <td className="font-mono text-success">{b.matched_count}</td>
                    <td className="font-mono text-warning">{b.unmatched_count}</td>
                    <td className="font-mono text-destructive">{b.failed_count}</td>
                    <td><BatchStatusBadge batch={b} /></td>
                    <td className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("en-GB")}</td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-primary"
                          aria-expanded={expandedBatchId === b.id}
                          aria-label={`${expandedBatchId === b.id ? "סגור" : "ניהול"} אצווה ${MONTHS[b.period_month - 1]} ${b.period_year}`}
                          onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}
                        >
                          {expandedBatchId === b.id ? "סגור" : "ניהול"}
                        </Button>
                        <IconButton
                          label={`מחק אצווה ${MONTHS[b.period_month - 1]} ${b.period_year}`}
                          className="text-destructive hover:text-destructive"
                          onClick={() => void confirm({
                            title: "למחוק את האצווה?",
                            description: `האצווה של ${MONTHS[b.period_month - 1]} ${b.period_year} (${b.total_pages} עמודים) וכל התלושים שלה יימחקו לצמיתות. פעולה זו לא ניתנת לביטול.`,
                            confirmLabel: "מחק אצווה",
                            destructive: true,
                            onConfirm: async () => {
                              await deleteBatch.mutateAsync(b.id);
                              toast({ title: "האצווה נמחקה" });
                            },
                          })}
                        >
                          <Trash2 />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                  {expandedBatchId === b.id && (
                    <tr>
                      <td colSpan={9} className="bg-muted/30 p-0">
                        <BatchPayslipsList batch={b} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PayslipsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

    </div>
  );
}

// ============================
// All payslips in a batch (matched + unmatched) with delete + assign
// ============================
function BatchPayslipsList({ batch }: { batch: any }) {
  const batchId = batch.id as string;
  const { data: payslips, isLoading } = useBatchPayslips(batchId);
  const { data: employees = [] } = useEmployees();
  const deletePayslip = useDeletePayslip();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [openingSource, setOpeningSource] = useState(false);

  const employeeOptions = (employees ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.full_name} (${e.id_number})`,
  }));

  const [pendingAssign, setPendingAssign] = useState<PendingPayslipAssign | null>(null);
  // Picking an employee only opens a confirmation; nothing is saved until confirmed.
  const handleAssign = (payslip: any, employeeId: string) => {
    if (!employeeId) return;
    const emp = (employees ?? []).find((e: any) => e.id === employeeId);
    setPendingAssign({ payslip, employeeId, employeeName: emp?.full_name ?? "העובד שנבחר" });
  };

  const savedPayslips = payslips ?? [];
  const sourcePdfPath = savedPayslips.find((p: any) => p.source_pdf_url)?.source_pdf_url as string | undefined;
  const failedCount = Math.max(Number(batch.failed_count ?? 0), 0);
  const coveredPages = new Set<number>();
  savedPayslips.forEach((p: any) => (p.page_indices ?? []).forEach((idx: number) => coveredPages.add(idx + 1)));
  const missingPages = Array.from({ length: Number(batch.total_pages ?? 0) }, (_, i) => i + 1).filter((page) => !coveredPages.has(page));
  const failedPages = missingPages.length ? missingPages : Array.from({ length: failedCount }, (_, i) => savedPayslips.length + i + 1);

  const openSourcePdf = async (page?: number) => {
    if (!sourcePdfPath) return;
    setOpeningSource(true);
    try {
      const url = await getPayslipSignedUrl(sourcePdfPath);
      if (!url) throw new Error("לא ניתן לפתוח את קובץ המקור");
      window.open(page ? `${url}#page=${page}` : url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "שגיאה בפתיחת הקובץ", description: e.message, variant: "destructive" });
    } finally {
      setOpeningSource(false);
    }
  };

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground" role="status">טוען את תלושי האצווה…</div>;

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-medium">תלושי האצווה ({savedPayslips.length})</p>
        {sourcePdfPath && (
          <Button size="sm" variant="outline" className="gap-1.5" loading={openingSource} onClick={() => openSourcePdf()}>
            <FileText className="w-3.5 h-3.5" />
            פתח PDF מקור
          </Button>
        )}
      </div>
      {failedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          <span className="font-medium">{failedCount} תלושים נכשלו ולא נשמרו כשורות.</span>
          {failedPages.length > 0 && (
            <>
              <span className="text-destructive/80">בדוק בקובץ המקור את העמודים שלא מופיעים ברשימה:</span>
              <span className="font-mono">{failedPages.join(", ")}</span>
            </>
          )}
        </div>
      )}
      {savedPayslips.length === 0 && failedCount === 0 && (
        <div className="p-4 text-center text-sm text-muted-foreground">אין תלושים באצווה זו</div>
      )}
      {savedPayslips.map((p: any) => {
        const isMatched = !!p.employee_id;
        const isFailed = p.extraction_status === "failed";
        return (
          <div key={p.id} className={`flex flex-wrap items-center gap-3 bg-background p-2.5 rounded-lg border ${isFailed ? "border-destructive/30" : "border-border/40"}`}>
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium">
                {isMatched ? p.employee?.full_name : (p.employee_name_detected ?? "לא זוהה שם")}
                {isFailed && <span className="ms-2 text-[0.8125rem] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">נכשל</span>}
                {!isFailed && isMatched && <span className="ms-2 text-[0.8125rem] px-2 py-0.5 rounded-full bg-success/10 text-success">משויך</span>}
                {!isFailed && !isMatched && <span className="ms-2 text-[0.8125rem] px-2 py-0.5 rounded-full bg-warning/10 text-warning">לא משויך</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                ת.ז.: <span className="font-mono">{p.id_number_detected ?? p.employee?.id_number ?? "—"}</span>
                {p.page_indices?.length > 0 && <span className="ms-2">עמוד {Math.min(...p.page_indices) + 1}</span>}
              </p>
              {isFailed && p.extraction_notes && <p className="mt-1 text-xs text-destructive/80">{p.extraction_notes}</p>}
            </div>
            {!isMatched && (
              <div className="order-last w-full sm:order-none sm:w-72">
                <SearchableSelect
                  options={employeeOptions}
                  value=""
                  onChange={(v) => handleAssign(p, v)}
                  placeholder="בחר עובד לשיוך..."
                />
              </div>
            )}
            <IconButton
              label={`מחק תלוש ${isMatched ? p.employee?.full_name ?? "" : p.employee_name_detected ?? ""}`.trim()}
              className="text-destructive hover:text-destructive"
              onClick={() => void confirm({
                title: "למחוק את התלוש?",
                description: "התלוש יימחק לצמיתות מהמערכת ומאחסון הקבצים. פעולה זו לא ניתנת לביטול.",
                confirmLabel: "מחק תלוש",
                destructive: true,
                onConfirm: async () => {
                  await deletePayslip.mutateAsync(p.id);
                  toast({ title: "התלוש נמחק" });
                },
              })}
            >
              <Trash2 />
            </IconButton>
          </div>
        );
      })}

      <PayslipAssignConfirmDialog pending={pendingAssign} onClose={() => setPendingAssign(null)} />

    </div>
  );
}
