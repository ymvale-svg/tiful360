import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, CheckCircle, AlertCircle, XCircle, Loader2, Circle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { uploadFile } from "@/lib/uploadWithProgress";
import { FileDrop } from "@/components/feedback/FileDrop";
import { FormField } from "@/components/feedback/FormField";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";

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

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const STAGES = [
  { key: "uploading", label: "מעלה את הקובץ…" },
  { key: "processing", label: "מפצל תלושים ומחלץ נתונים… (יכול לקחת דקה)" },
] as const;

export function PayslipsUploadDialog({ open, onOpenChange }: Props) {
  const init = defaultPeriod();
  const [year, setYear] = useState<number>(init.year);
  const [month, setMonth] = useState<number>(init.month);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing" | "done">("idle");
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();
  const busy = stage === "uploading" || stage === "processing";
  // Closing mid-run would lose the result summary; a picked file counts as unsaved work.
  const guard = useDirtyGuard(stage === "idle" && !!file, busy);

  const reset = () => {
    setFile(null);
    setStage("idle");
    setResult(null);
  };

  const close = guard((o: boolean) => { onOpenChange(o); if (!o) reset(); });

  const handleSubmit = async () => {
    if (!file || !activeCompanyId) return;
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: "קובץ גדול מדי", description: "מקסימום 25MB", variant: "destructive" });
      return;
    }

    try {
      setStage("uploading");
      const baseBody = {
        company_id: activeCompanyId,
        period_year: year,
        period_month: month,
        original_filename: file.name,
      };
      // Upload to the company's payslips folder (the "_source_" prefix keeps it out of employee
      // reach under the storage policy), then hand split-payslips the path instead of the bytes.
      const period = `${year}-${String(month).padStart(2, "0")}`;
      const path = `${activeCompanyId}/${period}/_source_upload_${crypto.randomUUID()}.pdf`;
      const up = await uploadFile("payslips", path, file, { contentType: "application/pdf" });

      setStage("processing");
      let res: { data: any; error: unknown } | null = null;
      if (!up.error) {
        res = await supabase.functions.invoke("split-payslips", { body: { ...baseBody, pdf_storage_path: path } });
      }
      // Fall back to the inline body when the upload was refused or the deployed function
      // predates storage-path support (it answers 400 without pdf_base64).
      const status = (res?.error as { context?: Response } | undefined)?.context?.status;
      if (!res || status === 400) {
        if (res) supabase.storage.from("payslips").remove([path]).then(() => {}, () => {});
        res = await supabase.functions.invoke("split-payslips", {
          body: { ...baseBody, pdf_base64: toBase64(await file.arrayBuffer()) },
        });
      }
      const { data, error } = res;
      if (error) throw error;
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
      toast({ title: "שגיאה בעיבוד התלושים", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            העלאת תלושי שכר חודשיים
          </DialogTitle>
          <DialogDescription>
            העלה את קובץ ה-PDF המאוחד של תלושי השכר. המערכת תפצל אותו אוטומטית לכל עובד לפי תעודת זהות ותעדכן יתרות חופשה ומחלה.
            <br />
            <span className="text-warning font-medium">העלאה חדשה מעדכנת רק את התלושים של תעודות הזהות שבקובץ — כל שאר התלושים הקיימים נשארים ללא שינוי.</span>
          </DialogDescription>
        </DialogHeader>

        {stage === "idle" && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="חודש">
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="w-full h-10 px-3 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="שנה">
                <Input
                  type="number"
                  inputMode="numeric"
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || init.year)}
                />
              </FormField>
            </div>

            <FileDrop
              accept="application/pdf,.pdf"
              onFiles={(files) => setFile(files[0] ?? null)}
              title={file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)` : "גררו לכאן את קובץ ה-PDF המאוחד או לחצו לבחירה"}
              hint={file ? "לחצו או גררו קובץ אחר כדי להחליף" : "PDF עד 25MB"}
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => close(false)}>ביטול</Button>
              <Button className="flex-1" disabled={!file} onClick={handleSubmit}>
                התחל עיבוד
              </Button>
            </div>
          </div>
        )}

        {busy && (
          <div className="space-y-4 mt-4" role="status" aria-live="polite">
            <ol className="space-y-2">
              {STAGES.map((s, i) => {
                const current = STAGES.findIndex((x) => x.key === stage);
                const state = i < current ? "done" : i === current ? "active" : "todo";
                return (
                  <li key={s.key} className="flex items-center gap-3 text-sm">
                    {state === "done" ? <CheckCircle className="w-5 h-5 text-success" aria-hidden="true" />
                      : state === "active" ? <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
                      : <Circle className="w-5 h-5 text-muted-foreground" aria-hidden="true" />}
                    <span className={state === "todo" ? "text-muted-foreground" : state === "active" ? "font-medium" : ""}>
                      שלב {i + 1} מתוך {STAGES.length}: {s.label}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              העיבוד מתבצע בשרת ועלול לקחת זמן עבור קבצים גדולים. אי אפשר לסגור את החלון עד שהעיבוד יסתיים.
            </p>
          </div>
        )}

        {stage === "done" && result && (
          <div className="space-y-4 mt-4">
            {result.issues?.length > 0 && (
              <div className="space-y-2">
                {result.issues.map((iss: any, i: number) => (
                  <div key={i} className="border border-warning/40 bg-warning/5 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-warning" />
                      {iss.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{iss.instruction}</p>
                    {iss.pages?.length > 0 && (
                      <p className="text-xs">
                        <span className="font-medium">עמודים:</span>{" "}
                        <span className="font-mono">{iss.pages.join(", ")}</span>
                      </p>
                    )}
                    {iss.ids?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {iss.ids.map((c: string) => (
                          <span key={c} className="text-xs font-mono bg-muted px-2 py-1 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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

            {result.matched_payslips?.length > 0 && (
              <div className="border border-success/30 rounded-lg">
                <div className="px-3 py-2 bg-success/5 border-b border-success/20 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <p className="text-sm font-medium">תלושים שעלו בהצלחה ({result.matched_payslips.length})</p>
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-start">עובד</th>
                        <th className="p-2 text-start">ת.ז.</th>
                        <th className="p-2 text-start">עמודים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.matched_payslips.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">{p.employee_name ?? "—"}</td>
                          <td className="p-2 font-mono">{p.id_number}</td>
                          <td className="p-2 font-mono">{(p.pages ?? []).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.failed_payslips?.length > 0 && (
              <div className="border border-destructive/30 rounded-lg">
                <div className="px-3 py-2 bg-destructive/5 border-b border-destructive/20 flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  <p className="text-sm font-medium">תלושים שנכשלו ({result.failed_payslips.length})</p>
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-start">עובד</th>
                        <th className="p-2 text-start">ת.ז.</th>
                        <th className="p-2 text-start">עמודים</th>
                        <th className="p-2 text-start">שגיאה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.failed_payslips.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">{p.employee_name ?? "—"}</td>
                          <td className="p-2 font-mono">{p.id_number ?? "—"}</td>
                          <td className="p-2 font-mono">{(p.pages ?? []).join(", ")}</td>
                          <td className="p-2 text-destructive">{p.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.unmatched_payslips?.length > 0 && (
              <div className="border border-warning/30 rounded-lg">
                <div className="px-3 py-2 bg-warning/5 border-b border-warning/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  <p className="text-sm font-medium">תלושים לא משויכים ({result.unmatched_payslips.length})</p>
                </div>
                <div className="max-h-48 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="p-2 text-start">שם בתלוש</th>
                        <th className="p-2 text-start">ת.ז.</th>
                        <th className="p-2 text-start">עמודים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.unmatched_payslips.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2">{p.employee_name ?? "—"}</td>
                          <td className="p-2 font-mono">{p.id_number}</td>
                          <td className="p-2 font-mono">{(p.pages ?? []).join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

            <Button className="w-full" onClick={() => close(false)}>סיום</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
