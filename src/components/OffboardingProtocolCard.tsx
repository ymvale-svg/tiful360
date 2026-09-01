import { useState } from "react";
import { UserMinus, ShieldOff, Package, Calendar, CheckCircle2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { buildOffboardingProtocolPdf } from "@/lib/pdf/lazy";
import { useEmployeeResourceHistory } from "@/hooks/useEmployeeResourceHistory";

interface Props {
  employee: any;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB");
}

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

export function OffboardingProtocolCard({ employee }: Props) {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const snapshot = (employee?.offboarding_snapshot ?? null) as { assets?: any[]; revoked_at?: string } | null;
  const { data: history } = useEmployeeResourceHistory(
    employee?.end_date ? employee?.id : undefined,
    snapshot?.assets ?? [],
    employee?.access_revoked_at ?? snapshot?.revoked_at ?? null
  );
  const revoked = !!employee?.access_revoked_at;
  const endPassed = employee?.end_date ? new Date(employee.end_date) < new Date(new Date().toDateString()) : false;


  if (!employee?.end_date) return null;

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await buildOffboardingProtocolPdf({
        companyName: activeCompany?.name ?? "",
        companyLogoUrl: activeCompany?.logo_url ?? activeCompany?.portal_logo_url ?? null,
        employeeName: employee.full_name,
        employeeCode: employee.employee_code,
        idNumber: employee.id_number,
        department: employee.department,
        role: employee.role,
        startDate: employee.start_date,
        endDate: employee.end_date,
        endDateRecordedAt: employee.end_date_recorded_at,
        accessRevokedAt: employee.access_revoked_at,
        status: employee.status,
        assets: snapshot?.assets ?? [],
        history: history ?? [],
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `offboarding-${employee.employee_code || employee.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "שגיאה בהפקת הפרוטוקול", description: e.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <UserMinus className="w-4 h-4 text-destructive" />
          פרוטוקול עזיבה
        </h2>
        <Button size="sm" variant="outline" className="gap-2" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          הורדת פרוטוקול לביקורת (PDF)
        </Button>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <dt className="text-xs text-muted-foreground">תאריך עזיבה</dt>
            <dd className="font-medium">{fmtDate(employee.end_date)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <dt className="text-xs text-muted-foreground">מועד הזנת תאריך העזיבה</dt>
            <dd className="font-medium">{fmtDateTime(employee.end_date_recorded_at)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ShieldOff className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <dt className="text-xs text-muted-foreground">חסימת גישה לתפעול 360</dt>
            <dd className="font-medium">
              {revoked ? (
                <span className="text-destructive">נחסם ב-{fmtDateTime(employee.access_revoked_at)}</span>
              ) : endPassed ? (
                "יבוצע בסבב הלילי הקרוב"
              ) : (
                `יבוצע לאחר ${fmtDate(employee.end_date)}`
              )}
            </dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-muted-foreground mt-0.5" />
          <div>
            <dt className="text-xs text-muted-foreground">סטטוס עובד</dt>
            <dd className="font-medium">{employee.status === "inactive" ? "לא פעיל" : "בעזיבה"}</dd>
          </div>
        </div>
      </dl>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" />
          מערכות וציוד שנותקו בתאריך העזיבה
        </p>
        {snapshot?.assets && snapshot.assets.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {snapshot.assets.map((a: any, i: number) => (
              <li key={i} className="flex items-center gap-2 border-b border-border/40 last:border-0 pb-1">
                <span className="font-medium">{a.asset_name}</span>
                <span className="text-muted-foreground">{a.asset_code}</span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px]">
                  {a.category}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {a.domain === "digital" ? "גישה דיגיטלית הושהתה" : "הוחזר למלאי"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {revoked ? "לא היו פריטים משויכים במועד הניתוק." : "טרם בוצע ניתוק — הרשימה תיווצר בתאריך העזיבה."}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5" />
          היסטוריית משאבים שהוקצו לעובד
        </p>
        {history && history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-[10px]">
                  <th className="text-right font-medium pb-1">משאב</th>
                  <th className="text-right font-medium pb-1">קטגוריה</th>
                  <th className="text-right font-medium pb-1">מועד הזנה</th>
                  <th className="text-right font-medium pb-1">מועד ניתוק</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="py-1 font-medium">
                      {h.assetName} {h.assetCode && <span className="text-muted-foreground">{h.assetCode}</span>}
                    </td>
                    <td className="py-1 text-muted-foreground">{h.category || "—"}</td>
                    <td className="py-1">{fmtDate(h.assignedAt)}</td>
                    <td className="py-1">
                      {h.releasedAt ? fmtDate(h.releasedAt) : h.stillAssigned ? "משויך" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">לא נמצאה היסטוריית הקצאות עבור העובד.</p>
        )}
      </div>

    </div>
  );
}
