import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UserMinus, AlertTriangle, Shield, Download } from "lucide-react";
import { useStartOffboarding } from "@/hooks/useOffboarding";
import { useToast } from "@/hooks/use-toast";
import { OffboardingFormsManager } from "@/components/OffboardingFormsManager";

interface OffboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    full_name: string;
    employee_code: string;
    role: string;
    department: string;
    id_number: string;
    start_date: string;
  };
  assets: Array<{
    id: string;
    asset_name: string;
    asset_code: string;
    serial_number: string | null;
    asset_categories?: { category_name: string } | null;
  }>;
  digitalAccess: Array<{
    id: string;
    access_type: string;
    resource_path: string;
    permission_level: string;
  }>;
}

export function OffboardingDialog({
  open,
  onOpenChange,
  employee,
  assets,
  digitalAccess,
}: OffboardingDialogProps) {
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]
  );
  const [step, setStep] = useState<"confirm" | "processing" | "done">("confirm");
  const [ticketCode, setTicketCode] = useState("");
  const { toast } = useToast();
  const offboarding = useStartOffboarding();

  const handleStart = async () => {
    setStep("processing");
    try {
      const result = await offboarding.mutateAsync({
        employeeId: employee.id,
        employeeName: employee.full_name,
        employeeCode: employee.employee_code,
        endDate,
        digitalAccess: digitalAccess.map((da) => ({
          access_type: da.access_type,
          resource_path: da.resource_path,
        })),
        assets: assets.map((a) => ({
          asset_name: a.asset_name,
          asset_code: a.asset_code,
          category_name: (a as any).asset_categories?.category_name ?? "",
        })),
      });
      setTicketCode(result.ticketCode);
      setStep("done");
      toast({ title: "תהליך עזיבה הופעל בהצלחה" });
    } catch (error: any) {
      setStep("confirm");
      toast({
        title: "שגיאה",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    const html2pdf = (await import("html2pdf.js")).default;
    const htmlContent = generateProtocolHtml(employee, assets, digitalAccess, endDate);
    const container = document.createElement("div");
    container.innerHTML = htmlContent;
    const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const wrapper = document.createElement("div");
    wrapper.setAttribute("dir", "rtl");
    if (styleMatch) {
      const style = document.createElement("style");
      style.textContent = styleMatch[1];
      wrapper.appendChild(style);
    }
    wrapper.innerHTML += bodyMatch ? bodyMatch[1] : htmlContent;
    document.body.appendChild(wrapper);
    
    await html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: `protocol_${employee.employee_code}_${endDate}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    }).from(wrapper).save();
    
    document.body.removeChild(wrapper);
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => setStep("confirm"), 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={step === "done" ? "max-w-3xl max-h-[90vh] overflow-y-auto" : "max-w-lg"} dir="rtl">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <UserMinus className="w-5 h-5" />
                התנעת תהליך עזיבה
              </DialogTitle>
              <DialogDescription>
                פעולה זו תפעיל את פרוטוקול הניתוק עבור {employee.full_name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              {/* Warning */}
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-destructive">שים לב - הפעולות הבאות יבוצעו:</p>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    <li>• שינוי סטטוס העובד ל"בתהליך עזיבה"</li>
                    <li>• השהיית {digitalAccess.length} הרשאות דיגיטליות</li>
                    <li>• יצירת קריאת IT לפרוטוקול ניתוק (SLA 4 שעות)</li>
                    <li>• הפקת פרוטוקול משיכת ציוד ({assets.length} פריטים)</li>
                  </ul>
                </div>
              </div>

              {/* End date */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">תאריך סיום עבודה</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  dir="ltr"
                />
              </div>

              {/* Summary */}
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">עובד:</span>
                  <span className="font-medium">{employee.full_name} ({employee.employee_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">מחלקה:</span>
                  <span>{employee.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ציוד להחזרה:</span>
                  <span className="font-medium">{assets.length} פריטים</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">הרשאות לביטול:</span>
                  <span className="font-medium">{digitalAccess.length} הרשאות</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={handleClose}>
                  ביטול
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 gap-2"
                  onClick={handleStart}
                >
                  <Shield className="w-4 h-4" />
                  אישור התנעת עזיבה
                </Button>
              </div>
            </div>
          </>
        )}

        {step === "processing" && (
          <div className="py-12 text-center">
            <div className="w-12 h-12 border-4 border-destructive border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-medium">מפעיל פרוטוקול ניתוק...</p>
            <p className="text-sm text-muted-foreground mt-1">משנה סטטוס, משהה הרשאות, יוצר קריאת IT</p>
          </div>
        )}

        {step === "done" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Shield className="w-5 h-5" />
                תהליך עזיבה הופעל בהצלחה
              </DialogTitle>
              <DialogDescription>
                נוצרה קריאת IT <span className="font-mono font-bold">{ticketCode}</span>.
                כעת ניתן ליצור טופסי החזרת ציוד דיגיטליים לעובד.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-4">
              <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-xs space-y-1">
                <p>✅ סטטוס העובד שונה ל"בתהליך עזיבה"</p>
                <p>✅ {digitalAccess.length} הרשאות דיגיטליות הושהו</p>
                <p>✅ נוצרה קריאת IT: <span className="font-mono font-bold">{ticketCode}</span></p>
              </div>

              <OffboardingFormsManager
                employee={{
                  id: employee.id,
                  full_name: employee.full_name,
                  employee_code: employee.employee_code,
                  id_number: employee.id_number,
                  department: employee.department,
                  role: employee.role,
                  end_date: endDate,
                  company_id: (employee as any).company_id ?? null,
                }}
                assets={assets.map((a) => ({
                  id: a.id,
                  asset_name: a.asset_name,
                  asset_code: a.asset_code,
                  serial_number: a.serial_number,
                  manufacturer_model: (a as any).manufacturer_model ?? null,
                  asset_categories: a.asset_categories,
                }))}
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleDownloadPdf}
                >
                  <Download className="w-4 h-4" />
                  הורד פרוטוקול מלא
                </Button>
                <Button className="flex-1" onClick={handleClose}>
                  סגור
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function esc(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function generateProtocolHtml(
  employee: OffboardingDialogProps["employee"],
  assets: OffboardingDialogProps["assets"],
  digitalAccess: OffboardingDialogProps["digitalAccess"],
  endDate: string
) {
  const today = new Date().toLocaleDateString("he-IL");
  const endDateFormatted = new Date(endDate).toLocaleDateString("he-IL");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<title>פרוטוקול משיכת ציוד - ${esc(employee.full_name)}</title>
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1a1a1a; }
  h1 { text-align: center; color: #dc2626; border-bottom: 3px solid #dc2626; padding-bottom: 12px; }
  h2 { color: #374151; margin-top: 24px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: right; font-size: 14px; }
  th { background: #f3f4f6; font-weight: 600; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; }
  .info-item { display: flex; gap: 8px; font-size: 14px; }
  .info-label { color: #6b7280; min-width: 120px; }
  .signature-row { display: flex; justify-content: space-between; margin-top: 60px; }
  .signature-box { text-align: center; width: 200px; }
  .signature-line { border-top: 1px solid #000; margin-top: 60px; padding-top: 8px; font-size: 14px; }
  .checkbox { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #374151; margin-left: 8px; vertical-align: middle; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
<h1>🔒 פרוטוקול משיכת ציוד</h1>
<p style="text-align:center; color:#6b7280;">תפעול 360 • מסמך ${today}</p>

<h2>פרטי עובד</h2>
<div class="info-grid">
  <div class="info-item"><span class="info-label">שם מלא:</span><strong>${esc(employee.full_name)}</strong></div>
  <div class="info-item"><span class="info-label">מזהה:</span>${esc(employee.employee_code)}</div>
  <div class="info-item"><span class="info-label">ת.ז:</span>${esc(employee.id_number)}</div>
  <div class="info-item"><span class="info-label">תפקיד:</span>${esc(employee.role)}</div>
  <div class="info-item"><span class="info-label">מחלקה:</span>${esc(employee.department)}</div>
  <div class="info-item"><span class="info-label">תחילת עבודה:</span>${new Date(employee.start_date).toLocaleDateString("he-IL")}</div>
  <div class="info-item"><span class="info-label">תאריך סיום:</span><strong style="color:#dc2626;">${endDateFormatted}</strong></div>
</div>

<h2>ציוד להחזרה (${assets.length} פריטים)</h2>
<table>
  <thead>
    <tr><th>הוחזר</th><th>מזהה</th><th>שם פריט</th><th>קטגוריה</th><th>מספר סידורי</th><th>הערות</th></tr>
  </thead>
  <tbody>
    ${assets.map(a => `<tr>
      <td style="text-align:center;"><span class="checkbox"></span></td>
      <td style="font-family:monospace;">${esc(a.asset_code)}</td>
      <td>${esc(a.asset_name)}</td>
      <td>${esc((a as any).asset_categories?.category_name)}</td>
      <td style="font-family:monospace;">${esc(a.serial_number)}</td>
      <td></td>
    </tr>`).join("")}
  </tbody>
</table>

<h2>הרשאות דיגיטליות לניתוק (${digitalAccess.length})</h2>
<table>
  <thead>
    <tr><th>נותק</th><th>סוג</th><th>משאב</th><th>רמת הרשאה</th></tr>
  </thead>
  <tbody>
    ${digitalAccess.map(da => `<tr>
      <td style="text-align:center;"><span class="checkbox"></span></td>
      <td>${esc(da.access_type)}</td>
      <td style="font-family:monospace;">${esc(da.resource_path)}</td>
      <td>${esc(da.permission_level)}</td>
    </tr>`).join("")}
  </tbody>
</table>

<h2>הצהרות</h2>
<p style="font-size:14px;"><span class="checkbox"></span> אני מאשר/ת שהחזרתי את כל הציוד המפורט לעיל במצב תקין.</p>
<p style="font-size:14px;"><span class="checkbox"></span> אני מאשר/ת שמחקתי את כל המידע האישי מהמכשירים שהוחזרו.</p>
<p style="font-size:14px;"><span class="checkbox"></span> אני מודע/ת שגישתי לכל מערכות החברה תופסק בתאריך הסיום.</p>

<div class="signature-row">
  <div class="signature-box">
    <div class="signature-line">חתימת העובד</div>
  </div>
  <div class="signature-box">
    <div class="signature-line">חתימת מנהל ישיר</div>
  </div>
  <div class="signature-box">
    <div class="signature-line">חתימת IT</div>
  </div>
</div>

<div class="footer">
  מסמך זה הופק אוטומטית ע"י מערכת תפעול 360 בתאריך ${today}. מספר מסמך: OFF-${esc(employee.employee_code)}-${esc(endDate)}
</div>
</body>
</html>`;
}
