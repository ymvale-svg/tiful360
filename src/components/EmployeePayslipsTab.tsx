import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeePayslips, getPayslipSignedUrl, useDeletePayslip } from "@/hooks/usePayslips";
import { Download, Calendar, TrendingUp, Stethoscope, FileText, Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PayslipSummaryDialog } from "@/components/PayslipSummaryDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  employeeId: string;
  employee: any;
  canSeeSalary: boolean;
}

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function EmployeePayslipsTab({ employeeId, employee, canSeeSalary }: Props) {
  const { data: payslips, isLoading } = useEmployeePayslips(employeeId);
  const { toast } = useToast();
  const [summaryPayslip, setSummaryPayslip] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const deleteMutation = useDeletePayslip();

  // Fetch fresh employee record with balance fields (employees_public view doesn't expose balances)
  const { data: empFull } = useQuery({
    queryKey: ["employee-balances", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("vacation_balance, sick_balance, balances_source, balances_updated_at, id_number, full_name")
        .eq("id", employeeId)
        .maybeSingle();
      return data;
    },
  });
  const emp: any = { ...(employee ?? {}), ...(empFull ?? {}) };

  const openPayslip = async (p: any) => {
    const usingSplit = !!p.pdf_url && p.pdf_url !== p.source_pdf_url;
    const path = p.pdf_url ?? p.source_pdf_url;
    if (!path) return;
    const url = await getPayslipSignedUrl(path, p.page_indices, !usingSplit);
    if (!url) {
      toast({ title: "שגיאה בהורדת התלוש", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const lastUpdate = emp?.balances_updated_at
    ? new Date(emp.balances_updated_at).toLocaleDateString("he-IL")
    : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <TrendingUp className="w-4 h-4" />
            יתרת חופשה
          </div>
          <p className="text-3xl font-bold mt-2 text-primary">
            {Number(emp?.vacation_balance ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">ימים</p>
        </div>
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Stethoscope className="w-4 h-4" />
            יתרת מחלה
          </div>
          <p className="text-3xl font-bold mt-2 text-info">
            {Number(emp?.sick_balance ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">ימים</p>
        </div>
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Calendar className="w-4 h-4" />
            עודכן לאחרונה
          </div>
          <p className="text-lg font-bold mt-2">{lastUpdate ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1">
            מקור: {emp?.balances_source === "payslip" ? "תלוש שכר" : "ידני"}
          </p>
        </div>
      </div>

      {/* Payslips table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            היסטוריית תלושים
          </h2>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">טוען...</div>
        ) : (payslips?.length ?? 0) === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            עדיין לא הועלו תלושים לעובד זה.
            {!emp?.id_number && (
              <p className="text-xs mt-2">טיפ: ודא שתעודת הזהות מוגדרת בכרטיס העובד כדי שהמערכת תזהה אוטומטית.</p>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>חודש</th>
                <th>שנה</th>
                {canSeeSalary && <th>ברוטו</th>}
                {canSeeSalary && <th>נטו</th>}
                <th>יתרת חופשה</th>
                <th>יתרת מחלה</th>
                <th>ימי עבודה</th>
                <th className="w-28">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {payslips!.map((p) => (
                <tr key={p.id}>
                  <td>{MONTHS[p.period_month - 1]}</td>
                  <td>{p.period_year}</td>
                  {canSeeSalary && <td className="font-mono">{p.gross_salary?.toLocaleString("he-IL") ?? "—"}</td>}
                  {canSeeSalary && <td className="font-mono">{p.net_salary?.toLocaleString("he-IL") ?? "—"}</td>}
                  <td className="font-mono">{p.vacation_balance ?? "—"}</td>
                  <td className="font-mono">{p.sick_balance ?? "—"}</td>
                  <td className="font-mono">{p.work_days ?? "—"}</td>
                  <td>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="סיכום" onClick={() => setSummaryPayslip(p)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="הורדה" onClick={() => openPayslip(p)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      {canSeeSalary && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="מחיקה"
                          onClick={() => setDeleteTarget(p)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <PayslipSummaryDialog
        open={!!summaryPayslip}
        onClose={() => setSummaryPayslip(null)}
        payslip={summaryPayslip}
        employeeName={employee?.full_name}
        canSeeSalary={canSeeSalary}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את התלוש?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `תלוש ${MONTHS[deleteTarget.period_month - 1]} ${deleteTarget.period_year} יימחק לצמיתות מהמערכת ומאחסון הקבצים. פעולה זו לא ניתנת לביטול.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(deleteTarget.id);
                  toast({ title: "התלוש נמחק" });
                  setDeleteTarget(null);
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
