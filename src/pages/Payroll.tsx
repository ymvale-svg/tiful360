import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Wallet, FileText, Stethoscope, Calendar, Clock4 } from "lucide-react";
import { Link } from "react-router-dom";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export default function Payroll() {
  const { activeCompanyId } = useCompany();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: monthBatches = [] } = useQuery({
    queryKey: ["payroll-batches", activeCompanyId, currentMonth, currentYear],
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
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <Wallet className="w-5 h-5 text-primary" />
          שכר ותלושים
        </h1>
        <p className="page-subtitle">דשבורד חשבות שכר — {MONTHS[currentMonth - 1]} {currentYear}</p>
      </div>

      {/* Payslip batches */}
      <section className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            אצוות תלושים אחרונות
          </h2>
          <Link to="/employees" className="text-xs text-primary hover:underline">לעובדים →</Link>
        </div>
        {monthBatches.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">טרם הועלו אצוות תלושים</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sick leave */}
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
                <div key={r.id} className="p-3 text-sm">
                  <p className="font-medium">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.total_days} ימים • {new Date(r.start_date).toLocaleDateString("he-IL")} – {new Date(r.end_date).toLocaleDateString("he-IL")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Approved vacation */}
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
                <div key={r.id} className="p-3 text-sm">
                  <p className="font-medium">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.total_days} ימים • {new Date(r.start_date).toLocaleDateString("he-IL")} – {new Date(r.end_date).toLocaleDateString("he-IL")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Approved attendance corrections */}
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
                  <td>{new Date(c.correction_date).toLocaleDateString("he-IL")}</td>
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
