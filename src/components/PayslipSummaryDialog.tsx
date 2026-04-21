import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Wallet, TrendingUp, Stethoscope, Calendar, Clock, ExternalLink, AlertCircle } from "lucide-react";
import { getPayslipSignedUrl } from "@/hooks/usePayslips";
import { useToast } from "@/hooks/use-toast";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

interface Props {
  open: boolean;
  onClose: () => void;
  payslip: any | null;
  employeeName?: string;
  canSeeSalary: boolean;
}

const fmt = (n: any) => n == null ? "—" : Number(n).toLocaleString("he-IL", { maximumFractionDigits: 2 });

export function PayslipSummaryDialog({ open, onClose, payslip, employeeName, canSeeSalary }: Props) {
  const { toast } = useToast();
  if (!payslip) return null;

  const open_pdf = async () => {
    if (!payslip.pdf_url) return;
    const url = await getPayslipSignedUrl(payslip.pdf_url);
    if (!url) {
      toast({ title: "שגיאה בפתיחת התלוש", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const tiles = [
    canSeeSalary && { icon: Wallet, label: "שכר ברוטו", value: fmt(payslip.gross_salary), suffix: "₪", color: "text-primary" },
    canSeeSalary && { icon: TrendingUp, label: "שכר נטו", value: fmt(payslip.net_salary), suffix: "₪", color: "text-success" },
    { icon: Calendar, label: "יתרת חופשה", value: fmt(payslip.vacation_balance), suffix: "ימים", color: "text-info" },
    { icon: Stethoscope, label: "יתרת מחלה", value: fmt(payslip.sick_balance), suffix: "ימים", color: "text-warning" },
    { icon: Calendar, label: "ימי עבודה", value: fmt(payslip.work_days), suffix: "ימים", color: "text-foreground" },
    { icon: Clock, label: "שעות עבודה", value: fmt(payslip.work_hours), suffix: "שעות", color: "text-foreground" },
  ].filter(Boolean) as any[];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            סיכום תלוש {MONTHS[payslip.period_month - 1]} {payslip.period_year}
            {employeeName && <span className="text-muted-foreground font-normal">— {employeeName}</span>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {tiles.map((t, i) => (
            <div key={i} className="bg-muted/40 rounded-xl p-4 border border-border/50">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </div>
              <p className={`text-2xl font-bold mt-1.5 ${t.color}`}>{t.value}</p>
              <p className="text-[10px] text-muted-foreground">{t.suffix}</p>
            </div>
          ))}
        </div>

        {payslip.extraction_status === 'partial' && (
          <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 rounded-lg p-3 mt-2 border border-warning/30">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>נתונים חלקיים — חלק מהשדות לא חולצו אוטומטית. ניתן לפתוח את התלוש המקורי לצפייה מלאה.</span>
          </div>
        )}

        {payslip.extraction_notes && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3 mt-2">
            הערות חילוץ: {payslip.extraction_notes}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
          <Button variant="outline" onClick={onClose}>סגירה</Button>
          {payslip.pdf_url && (
            <Button onClick={open_pdf} className="gap-1.5">
              <ExternalLink className="w-4 h-4" />
              פתח תלוש מקורי
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
