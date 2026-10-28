import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, AlertCircle, CheckCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { useAssetCategories, useAssets } from "@/hooks/useData";
import { loadXlsx, type XlsxModule } from "@/lib/xlsx";
import { validateAssetImportRows } from "@/lib/assetImportValidation";
import { runBatch } from "@/lib/batchProgress";
import { FileDrop } from "@/components/feedback/FileDrop";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedAsset {
  asset_code: string;
  asset_name: string;
  category_name?: string;
  serial_number?: string;
  owner_name?: string;
  status?: string;
  expiry_date?: string;
  notes?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const ASSET_COLUMNS = [
  { key: "asset_code", label: "מזהה", required: true },
  { key: "asset_name", label: "שם פריט", required: true },
  { key: "category_name", label: "קטגוריה", required: true },
  { key: "serial_number", label: "מס׳ סידורי", required: false },
  { key: "status", label: "סטטוס", required: false },
  { key: "expiry_date", label: "תאריך תפוגה", required: false },
  { key: "notes", label: "הערות", required: false },
];

const COLUMN_MAP: Record<string, string> = {
  "מזהה": "asset_code",
  "קוד": "asset_code",
  "asset_code": "asset_code",
  "code": "asset_code",
  "שם פריט": "asset_name",
  "שם": "asset_name",
  "asset_name": "asset_name",
  "name": "asset_name",
  "קטגוריה": "category_name",
  "category": "category_name",
  "category_name": "category_name",
  "מס׳ סידורי": "serial_number",
  "מספר סידורי": "serial_number",
  "סידורי": "serial_number",
  "serial": "serial_number",
  "serial_number": "serial_number",
  "סטטוס": "status",
  "status": "status",
  "תאריך תפוגה": "expiry_date",
  "תפוגה": "expiry_date",
  "expiry_date": "expiry_date",
  "expiry": "expiry_date",
  "הערות": "notes",
  "notes": "notes",
};

const STATUS_MAP: Record<string, string> = {
  "בשימוש": "in_use",
  "במלאי": "in_stock",
  "בתיקון": "in_repair",
  "אבד": "lost",
  "in_use": "in_use",
  "in_stock": "in_stock",
  "in_repair": "in_repair",
  "lost": "lost",
};

function normalizeColumnName(name: string): string | undefined {
  const cleaned = name.trim().replace(/['"]/g, "").toLowerCase();
  for (const [key, value] of Object.entries(COLUMN_MAP)) {
    if (key.toLowerCase() === cleaned) return value;
  }
  return undefined;
}

function parseExcelDate(value: any, XLSX: XlsxModule): string | undefined {
  if (!value) return undefined;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  return undefined;
}

export function ImportAssetsExcelDialog({ open, onOpenChange }: Props) {
  const [rows, setRows] = useState<ParsedAsset[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const { data: categories } = useAssetCategories();
  const { data: existingAssets } = useAssets();
  const queryClient = useQueryClient();

  // Checked in the preview, before anything is written.
  const checks = useMemo(
    () => validateAssetImportRows(rows, (categories ?? []) as any[], (existingAssets ?? []).map((a: any) => a.asset_code ?? "")),
    [rows, categories, existingAssets],
  );
  const validCount = checks.filter((c) => c.issues.length === 0).length;
  const invalidCount = rows.length - validCount;

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
  };

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const XLSX = await loadXlsx();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      const parsed: ParsedAsset[] = json.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          const col = normalizeColumnName(key);
          if (col) mapped[col] = String(value ?? "").trim();
        }
        if (mapped.expiry_date) {
          const originalValue = Object.entries(row).find(([k]) => normalizeColumnName(k) === "expiry_date")?.[1];
          mapped.expiry_date = parseExcelDate(originalValue, XLSX) || mapped.expiry_date;
        }
        if (mapped.status) {
          mapped.status = STATUS_MAP[mapped.status.trim()] || "in_stock";
        }
        return mapped as ParsedAsset;
      }).filter((r) => r.asset_name || r.asset_code || r.category_name);

      setRows(parsed);
      if (parsed.length === 0) {
        toast({ title: "לא נמצאו שורות תקינות", description: "ודא שהקובץ מכיל עמודות: מזהה, שם פריט, קטגוריה", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!activeCompanyId || validCount === 0) return;
    setImporting(true);
    // Rows that failed the preview check are reported, not sent.
    const errors: string[] = checks
      .map((c, i) => (c.issues.length ? `שורה ${i + 1} (${rows[i].asset_name || "ללא שם"}): ${c.issues.join(", ")}` : null))
      .filter((e): e is string => !!e);
    const ready = rows
      .map((row, i) => ({ row, i, categoryId: checks[i].categoryId }))
      .filter(({ i }) => checks[i].issues.length === 0);

    setProgress({ done: 0, total: ready.length });
    const { done, failed } = await runBatch(ready, async ({ row, categoryId }, idx) => {
      setProgress({ done: idx, total: ready.length });
      const { error } = await supabase.from("assets").insert({
        asset_code: row.asset_code!,
        asset_name: row.asset_name!,
        category_id: categoryId!,
        serial_number: row.serial_number || null,
        status: (row.status as any) || "in_stock",
        expiry_date: row.expiry_date || null,
        notes: row.notes || null,
        company_id: activeCompanyId,
      });
      if (error) throw new Error(error.message);
    }, { name: "ייבוא ציוד מאקסל", unit: "שורה" });
    failed.forEach(({ item, error }) => errors.push(`שורה ${item.i + 1} (${item.row.asset_name}): ${error}`));

    setResult({ success: done, failed: errors.length, errors });
    setProgress(null);
    setImporting(false);
    const success = done;
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

    if (success > 0) {
      toast({ title: `${success} פריטים יובאו בהצלחה` });
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await loadXlsx();
    const headers = ASSET_COLUMNS.map((c) => c.label);
    const example = ["IT-001", "מחשב נייד Dell", "מחשבים", "SN-12345", "במלאי", "2026-12-31", "חדש"];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "ציוד");
    XLSX.writeFile(wb, "תבנית_יבוא_ציוד.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && importing) return; if (!o) reset(); onOpenChange(o); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        onInteractOutside={(e) => { if (importing) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            יבוא ציוד מאקסל
          </DialogTitle>
          <DialogDescription>
            העלה קובץ Excel (.xlsx / .xls) עם נתוני הציוד. שם הקטגוריה חייב להתאים לקטגוריות קיימות במערכת.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">הורד תבנית לדוגמה</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              הורד תבנית
            </Button>
          </div>

          <FileDrop
            accept=".xlsx,.xls,.csv"
            disabled={importing}
            onFiles={(files) => handleFile(files[0])}
            title={fileName ? fileName : "גררו קובץ אקסל לכאן או לחצו לבחירה"}
            hint={fileName ? "לחצו או גררו קובץ אחר כדי להחליף" : "xlsx, xls, csv"}
          />

          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                נמצאו <span className="text-primary font-bold">{rows.length}</span> שורות
                {invalidCount > 0
                  ? <> — <span className="text-success">{validCount} מוכנות לייבוא</span>, <span className="text-destructive">{invalidCount} עם בעיות שלא ייובאו</span></>
                  : " — כולן מוכנות לייבוא"}
              </p>
              <div className="max-h-48 overflow-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-start">#</th>
                      <th className="p-2 text-start">מזהה</th>
                      <th className="p-2 text-start">שם פריט</th>
                      <th className="p-2 text-start">קטגוריה</th>
                      <th className="p-2 text-start">סטטוס</th>
                      <th className="p-2 text-start">בדיקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Rows with problems first, so they are seen before importing. */}
                    {rows.map((r, i) => ({ r, i })).sort((a, b) => Number(checks[b.i].issues.length > 0) - Number(checks[a.i].issues.length > 0)).slice(0, 10).map(({ r, i }) => (
                      <tr key={i} className={`border-t border-border ${checks[i].issues.length ? "bg-destructive/5" : ""}`}>
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-mono">{r.asset_code}</td>
                        <td className="p-2">{r.asset_name}</td>
                        <td className="p-2">{r.category_name ?? "—"}</td>
                        <td className="p-2">{r.status ?? "במלאי"}</td>
                        <td className="p-2">
                          {checks[i].issues.length ? (
                            <span className="inline-flex items-start gap-1 text-destructive">
                              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                              {checks[i].issues.join(", ")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              תקין
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ועוד {rows.length - 10} שורות...
                  </p>
                )}
              </div>

              <Button className="w-full gap-2" onClick={handleImport} disabled={importing || validCount === 0} aria-busy={importing || undefined}>
                {importing
                  ? `מייבא… שורה ${(progress?.done ?? 0) + 1} מתוך ${progress?.total ?? validCount}`
                  : validCount === 0
                    ? "אין שורות תקינות לייבוא"
                    : invalidCount > 0 ? `ייבא ${validCount} פריטים תקינים` : `ייבא ${validCount} פריטים`}
              </Button>
              {importing && <p className="text-xs text-muted-foreground text-center" role="status">אפשר לסגור את החלון רק בסיום הייבוא.</p>}
            </div>
          )}

          {result && (
            <div className="space-y-3" role="status">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <CheckCircle className="w-8 h-8 text-success flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{result.success} פריטים יובאו בהצלחה</p>
                  {result.failed > 0 && (
                    <p className="text-sm text-destructive">{result.failed} שורות נכשלו</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-auto border border-destructive/20 rounded-lg p-3 space-y-1">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-start gap-1">
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      {err}
                    </p>
                  ))}
                </div>
              )}

              <Button variant="outline" className="w-full" onClick={() => { reset(); onOpenChange(false); }}>
                סגור
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
