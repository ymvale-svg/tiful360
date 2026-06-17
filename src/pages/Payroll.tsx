import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Wallet, FileText, Stethoscope, Calendar, Clock4, Upload, LayoutDashboard, FolderOpen, UserSearch, Settings as SettingsIcon, Save, Mail, Paperclip, AlertCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PayslipsUploadDialog } from "@/components/PayslipsUploadDialog";
import { getPayslipSignedUrl, usePayslipBatches, useUnmatchedPayslips, useAssignPayslipToEmployee, useBatchPayslips, useDeletePayslip, useDeleteBatch } from "@/hooks/usePayslips";
import { Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEmployees } from "@/hooks/useData";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EmployeePayslipsTab } from "@/components/EmployeePayslipsTab";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Tax101AdminTab } from "@/components/payroll/Tax101AdminTab";
import { AttendanceClockTab } from "@/components/payroll/AttendanceClockTab";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const TYPE_LABELS_PAYROLL: Record<string, string> = { vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר" };

export default function Payroll() {
  const { activeCompanyId } = useCompany();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "overview";
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const setTab = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          שכר ותלושים
        </h1>
        <p className="page-subtitle">דשבורד חשבות שכר — {MONTHS[currentMonth - 1]} {currentYear}</p>
      </div>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="w-4 h-4" />
            סקירה
          </TabsTrigger>
          <TabsTrigger value="batches" className="gap-1.5">
            <FolderOpen className="w-4 h-4" />
            ניהול תלושים
          </TabsTrigger>
          <TabsTrigger value="employee" className="gap-1.5">
            <UserSearch className="w-4 h-4" />
            תלושי עובד
          </TabsTrigger>
          <TabsTrigger value="tax101" className="gap-1.5">
            <FileText className="w-4 h-4" />
            טפסי עובדים
          </TabsTrigger>
          <TabsTrigger value="attendance" className="gap-1.5">
            <Clock4 className="w-4 h-4" />
            שעוני נוכחות
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <SettingsIcon className="w-4 h-4" />
            הגדרות שכר
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="batches">
          <BatchesManagementTab />
        </TabsContent>

        <TabsContent value="employee">
          <EmployeeLookupTab />
        </TabsContent>

        <TabsContent value="tax101">
          <Tax101AdminTab />
        </TabsContent>

        <TabsContent value="attendance">
          <AttendanceClockTab />
        </TabsContent>

        <TabsContent value="settings">
          <PayrollSettingsTab />
        </TabsContent>
      </Tabs>
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
  const [loaded, setLoaded] = useState(false);

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
      setLoaded(true);
    }
  }, [companyFull, loaded]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const emailsList = payrollEmails.split(",").map((s) => s.trim()).filter(Boolean);
      const invalid = emailsList.filter((e) => !/^\S+@\S+\.\S+$/.test(e));
      if (invalid.length > 0) throw new Error(`כתובות לא תקינות: ${invalid.join(", ")}`);

      const { error } = await supabase.rpc("set_company_routing_emails", {
        _company_id: activeCompanyId,
        _column: "payroll_emails",
        _emails: emailsList.length > 0 ? emailsList.join(",") : "",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-full"] });
      toast({ title: "הגדרות שכר נשמרו בהצלחה" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Mail className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">כתובות אימייל מחלקת שכר</h3>
      </div>
      <div>
        <label htmlFor="payroll-emails" className="text-sm font-medium mb-1.5 block">כתובות אימייל</label>
        <input
          id="payroll-emails"
          type="text"
          value={payrollEmails}
          onChange={(e) => setPayrollEmails(e.target.value)}
          placeholder="payroll@company.com, hr@company.com"
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          dir="ltr"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          ניתן להזין מספר כתובות מופרדות בפסיק. אישורי בקשות חופשה ומחלה יישלחו אוטומטית לכתובות אלו.
        </p>
      </div>
      <Button className="gap-1.5" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
        <Save className="w-4 h-4" />
        {updateMutation.isPending ? "שומר..." : "שמור שינויים"}
      </Button>
    </div>
  );
}

// ============================
// Overview Tab (existing content)
// ============================
function OverviewTab() {
  const { activeCompanyId } = useCompany();
  const [uploadOpen, setUploadOpen] = useState(false);

  const { data: monthBatches = [] } = useQuery({
    queryKey: ["payroll-batches-recent", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data } = await supabase
        .from("payslip_batches")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false })
        .limit(6);
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });

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
      <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
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
            <Link to="/payroll?tab=batches" className="text-xs text-primary hover:underline">לניהול תלושים →</Link>
          </div>
        </div>
        {monthBatches.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground space-y-3">
            <p>טרם הועלו אצוות תלושים</p>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4" />
              העלה אצווה ראשונה
            </Button>
          </div>
        ) : (
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
                  <td><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
                    <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Paperclip className="w-3 h-3" />
                        אישור מחלה
                      </Button>
                    </a>
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
                    <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-block">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Paperclip className="w-3 h-3" />
                        קובץ מצורף
                      </Button>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border/50">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Clock4 className="w-4 h-4 text-primary" />
            תיקוני שעון מאושרים
          </h2>
        </div>
        {corrections.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">אין תיקוני שעון מאושרים</div>
        ) : (
          <table className="data-table">
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
  const [deleteBatchTarget, setDeleteBatchTarget] = useState<any | null>(null);
  const { data: batches, isLoading } = usePayslipBatches();
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
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">כל השנים</option>
            {years.map((y: any) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">כל החודשים</option>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
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
              {isLoading && <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">טוען...</td></tr>}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-6 text-muted-foreground">אין אצוות להצגה</td></tr>
              )}
              {filtered.map((b: any) => (
                <>
                  <tr key={b.id}>
                    <td className="font-medium">{MONTHS[b.period_month - 1]} {b.period_year}</td>
                    <td className="text-xs text-muted-foreground">{b.original_filename ?? "—"}</td>
                    <td className="font-mono">{b.total_pages}</td>
                    <td className="font-mono text-success">{b.matched_count}</td>
                    <td className="font-mono text-warning">{b.unmatched_count}</td>
                    <td className="font-mono text-destructive">{b.failed_count}</td>
                    <td><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted">{b.status}</span></td>
                    <td className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("en-GB")}</td>
                    <td>
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setExpandedBatchId(expandedBatchId === b.id ? null : b.id)}
                          className="text-xs text-primary hover:underline"
                        >
                          {expandedBatchId === b.id ? "סגור" : "ניהול"}
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          title="מחק אצווה"
                          onClick={() => setDeleteBatchTarget(b)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PayslipsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <AlertDialog open={!!deleteBatchTarget} onOpenChange={(o) => !o && setDeleteBatchTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את האצווה?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBatchTarget && `האצווה של ${MONTHS[deleteBatchTarget.period_month - 1]} ${deleteBatchTarget.period_year} (${deleteBatchTarget.total_pages} עמודים) וכל התלושים שלה יימחקו לצמיתות. פעולה זו לא ניתנת לביטול.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteBatch.mutateAsync(deleteBatchTarget.id);
                  toast({ title: "האצווה נמחקה" });
                  setDeleteBatchTarget(null);
                } catch (e: any) {
                  toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
                }
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const assign = useAssignPayslipToEmployee();
  const deletePayslip = useDeletePayslip();
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [openingSource, setOpeningSource] = useState(false);

  const employeeOptions = (employees ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.full_name} (${e.id_number})`,
  }));

  const handleAssign = async (payslipId: string, employeeId: string) => {
    try {
      await assign.mutateAsync({ payslipId, employeeId });
      toast({ title: "התלוש שויך בהצלחה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
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

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">טוען...</div>;

  return (
    <div className="p-4 space-y-2">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-sm font-medium">תלושי האצווה ({savedPayslips.length})</p>
        {sourcePdfPath && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={openingSource} onClick={() => openSourcePdf()}>
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
          <div key={p.id} className={`flex items-center gap-3 bg-background p-2.5 rounded-lg border ${isFailed ? "border-destructive/30" : "border-border/40"}`}>
            <div className="flex-1 text-sm">
              <p className="font-medium">
                {isMatched ? p.employee?.full_name : (p.employee_name_detected ?? "לא זוהה שם")}
                {isFailed && <span className="ms-2 text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">נכשל</span>}
                {!isFailed && isMatched && <span className="ms-2 text-[10px] px-2 py-0.5 rounded-full bg-success/10 text-success">משויך</span>}
                {!isFailed && !isMatched && <span className="ms-2 text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning">לא משויך</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                ת.ז.: <span className="font-mono">{p.id_number_detected ?? p.employee?.id_number ?? "—"}</span>
                {p.page_indices?.length > 0 && <span className="ms-2">עמוד {Math.min(...p.page_indices) + 1}</span>}
              </p>
              {isFailed && p.extraction_notes && <p className="mt-1 text-xs text-destructive/80">{p.extraction_notes}</p>}
            </div>
            {!isMatched && (
              <div className="w-72">
                <SearchableSelect
                  options={employeeOptions}
                  value=""
                  onChange={(v) => handleAssign(p.id, v)}
                  placeholder="בחר עובד לשיוך..."
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              title="מחק תלוש"
              onClick={() => setDeleteTarget(p)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        );
      })}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את התלוש?</AlertDialogTitle>
            <AlertDialogDescription>
              התלוש יימחק לצמיתות מהמערכת ומאחסון הקבצים. פעולה זו לא ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deletePayslip.mutateAsync(deleteTarget.id);
                  toast({ title: "התלוש נמחק" });
                  setDeleteTarget(null);
                } catch (e: any) {
                  toast({ title: "שגיאה", description: e.message, variant: "destructive" });
                }
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================
// Unmatched Payslips inline list
// ============================
function UnmatchedPayslipsList({ batchId }: { batchId: string }) {
  const { data: unmatched, isLoading } = useUnmatchedPayslips(batchId);
  const { data: employees = [] } = useEmployees();
  const assign = useAssignPayslipToEmployee();
  const { toast } = useToast();

  const employeeOptions = (employees ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.full_name} (${e.id_number})`,
  }));

  const handleAssign = async (payslipId: string, employeeId: string) => {
    try {
      await assign.mutateAsync({ payslipId, employeeId });
      toast({ title: "התלוש שויך בהצלחה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  if (isLoading) return <div className="p-4 text-center text-sm text-muted-foreground">טוען...</div>;
  if (!unmatched || unmatched.length === 0) {
    return <div className="p-4 text-center text-sm text-muted-foreground">אין תלושים לא משויכים</div>;
  }

  return (
    <div className="p-4 space-y-2">
      <p className="text-sm font-medium mb-2">תלושים לא משויכים ({unmatched.length})</p>
      {unmatched.map((p) => (
        <div key={p.id} className="flex items-center gap-3 bg-background p-2.5 rounded-lg border border-border/40">
          <div className="flex-1 text-sm">
            <p className="font-medium">{p.employee_name_detected ?? "לא זוהה שם"}</p>
            <p className="text-xs text-muted-foreground">
              ת.ז.: <span className="font-mono">{p.id_number_detected ?? "—"}</span>
            </p>
          </div>
          <div className="w-72">
            <SearchableSelect
              options={employeeOptions}
              value=""
              onChange={(v) => handleAssign(p.id, v)}
              placeholder="בחר עובד לשיוך..."
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================
// Employee Lookup Tab
// ============================
function EmployeeLookupTab() {
  const { activeCompanyId } = useCompany();
  const { data: employees = [] } = useEmployees();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const employeeId = searchParams.get("employee") ?? "";

  const setEmployeeId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set("employee", id); else next.delete("employee");
    setSearchParams(next, { replace: true });
  };

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  const employeeOptions = (employees ?? []).map((e: any) => ({
    value: e.id,
    label: `${e.full_name} • ${e.department}`,
  }));
  const selected = (employees ?? []).find((e: any) => e.id === employeeId);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-4">
        <label className="text-sm font-medium mb-2 block">בחר עובד</label>
        <div className="max-w-md">
          <SearchableSelect
            options={employeeOptions}
            value={employeeId}
            onChange={setEmployeeId}
            placeholder="חפש עובד..."
          />
        </div>
      </div>

      {selected ? (
        <EmployeePayslipsTab employeeId={selected.id} employee={selected} canSeeSalary={isAdmin} />
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-sm text-muted-foreground">
          בחר עובד כדי לראות את תלושי השכר שלו
        </div>
      )}
    </div>
  );
}
