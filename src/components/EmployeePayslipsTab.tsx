import { useEmployeePayslips, getPayslipSignedUrl } from "@/hooks/usePayslips";
import { Download, Calendar, TrendingUp, Stethoscope, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  employeeId: string;
  employee: any;
  canSeeSalary: boolean;
}

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function EmployeePayslipsTab({ employeeId, employee, canSeeSalary }: Props) {
  const { data: payslips, isLoading } = useEmployeePayslips(employeeId);
  const { toast } = useToast();

  const download = async (path: string | null) => {
    if (!path) return;
    const url = await getPayslipSignedUrl(path);
    if (!url) {
      toast({ title: "שגיאה בהורדת התלוש", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const lastUpdate = employee?.balances_updated_at
    ? new Date(employee.balances_updated_at).toLocaleDateString("he-IL")
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
            {Number(employee?.vacation_balance ?? 0).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">ימים</p>
        </div>
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Stethoscope className="w-4 h-4" />
            יתרת מחלה
          </div>
          <p className="text-3xl font-bold mt-2 text-info">
            {Number(employee?.sick_balance ?? 0).toFixed(2)}
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
            מקור: {employee?.balances_source === "payslip" ? "תלוש שכר" : "ידני"}
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
            {!employee?.michpal_code && (
              <p className="text-xs mt-2">טיפ: ודא שמספר העובד במיכפל מוגדר בכרטיס העובד כדי שהמערכת תזהה אוטומטית.</p>
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
                <th className="w-24">פעולות</th>
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
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => download(p.pdf_url)}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
