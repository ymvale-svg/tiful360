import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, CheckCircle, AlertCircle, XCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function defaultPeriod() {
  // Default to previous month
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function PayslipsUploadDialog({ open, onOpenChange }: Props) {
  const init = defaultPeriod();
  const [year, setYear] = useState<number>(init.year);
  const [month, setMonth] = useState<number>(init.month);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();

  const reset = () => {
    setFile(null);
    setStage("idle");
    setProgress(0);
    setResult(null);
  };

  const handleSubmit = async () => {
    if (!file || !activeCompanyId) return;
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "קובץ גדול מדי", description: "מקסימום 25MB", variant: "destructive" });
      return;
    }

    try {
      setStage("uploading");
      setProgress(15);
      // Read as base64
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const base64 = btoa(binary);
      setProgress(40);
      setStage("processing");

      const { data, error } = await supabase.functions.invoke("split-payslips", {
        body: {
          company_id: activeCompanyId,
          period_year: year,
          period_month: month,
          pdf_base64: base64,
          original_filename: file.name,
        },
      });
      if (error) throw error;
      setProgress(100);
      setStage("done");
      setResult(data);
      qc.invalidateQueries({ queryKey: ["payslip-batches"] });
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["employee-balances"] });
      qc.invalidateQueries({ queryKey: ["employee"] });
      if ((data?.groups ?? 0) === 0) {
        toast({
          title: "לא זוהו תעודות זהות בקובץ",
          description: "ייתכן שה-PDF סרוק (תמונה) או שהפורמט שונה. נסה PDF טקסטואלי.",
          variant: "destructive",
        });
      } else {
        toast({ title: "התלושים עובדו", description: `${data?.matched ?? 0} הותאמו, ${data?.unmatched ?? 0} לא הותאמו` });
      }
    } catch (e: any) {
      setStage("idle");
      setProgress(0);
      toast({ title: "שגיאה בעיבוד התלושים", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            העלאת תלושי שכר חודשיים
          </DialogTitle>
          <DialogDescription>
            העלה את קובץ ה-PDF המאוחד של תלושי השכר. המערכת תפצל אותו אוטומטית לכל עובד לפי תעודת זהות ותעדכן יתרות חופשה ומחלה.
          </DialogDescription>
        </DialogHeader>

        {stage === "idle" && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">חודש</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">שנה</label>
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || init.year)}
                  className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              {file ? (
                <p className="text-sm font-medium">{file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)</p>
              ) : (
                <p className="text-sm text-muted-foreground">לחץ לבחירת קובץ PDF מאוחד</p>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button className="flex-1" disabled={!file} onClick={handleSubmit}>
                התחל עיבוד
              </Button>
            </div>
          </div>
        )}

        {(stage === "uploading" || stage === "processing") && (
          <div className="space-y-4 mt-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">
                {stage === "uploading" ? "מעלה את הקובץ..." : "מפצל ומחלץ נתונים מהתלושים... (יכול לקחת דקה)"}
              </span>
            </div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              העיבוד מתבצע בשרת ועלול לקחת זמן עבור קבצים גדולים. אנא המתן.
            </p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-xs text-muted-foreground">הותאמו</span>
                </div>
                <p className="text-2xl font-bold text-success mt-1">{result.matched ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  <span className="text-xs text-muted-foreground">לא הותאמו</span>
                </div>
                <p className="text-2xl font-bold text-warning mt-1">{result.unmatched ?? 0}</p>
              </div>
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <span className="text-xs text-muted-foreground">נכשלו</span>
                </div>
                <p className="text-2xl font-bold text-destructive mt-1">{result.failed ?? 0}</p>
              </div>
            </div>

            {result.unmatched_id_numbers?.length > 0 && (
              <div className="border border-warning/30 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  מספרי תעודת זהות לא מוכרים במערכת:
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.unmatched_id_numbers.map((c: string) => (
                    <span key={c} className="text-xs font-mono bg-muted px-2 py-1 rounded">{c}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  שייך אותם ידנית במסך הגדרות → שכר ותלושים → תלושים לא משויכים, או ודא שתעודת הזהות בכרטיס העובד תואמת לזו שבתלוש.
                </p>
              </div>
            )}

            {result.balance_changes?.length > 0 && (
              <div className="border border-border rounded-lg max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-start">עובד</th>
                      <th className="p-2 text-start">חופשה (קודם → חדש)</th>
                      <th className="p-2 text-start">מחלה (קודם → חדש)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.balance_changes.map((b: any, i: number) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2">{b.employee_name}</td>
                        <td className="p-2 font-mono">{b.vacation_old ?? "—"} → <span className="font-bold">{b.vacation_new ?? "—"}</span></td>
                        <td className="p-2 font-mono">{b.sick_old ?? "—"} → <span className="font-bold">{b.sick_new ?? "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button className="w-full" onClick={() => { onOpenChange(false); reset(); }}>סיום</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
