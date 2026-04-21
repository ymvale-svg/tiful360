import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useQueryClient } from "@tanstack/react-query";
import { useAssetCategories } from "@/hooks/useData";
import * as XLSX from "xlsx";

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

function parseExcelDate(value: any): string | undefined {
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
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const { data: categories } = useAssetCategories();
  const queryClient = useQueryClient();

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
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
          mapped.expiry_date = parseExcelDate(originalValue) || mapped.expiry_date;
        }
        if (mapped.status) {
          mapped.status = STATUS_MAP[mapped.status.trim()] || "in_stock";
        }
        return mapped as ParsedAsset;
      }).filter((r) => r.asset_name && r.asset_code);

      setRows(parsed);
      if (parsed.length === 0) {
        toast({ title: "לא נמצאו שורות תקינות", description: "ודא שהקובץ מכיל עמודות: מזהה, שם פריט, קטגוריה", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!activeCompanyId || rows.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let success = 0;

    // Build category lookup by name
    const catMap = new Map<string, string>();
    (categories ?? []).forEach((c) => catMap.set(c.category_name.trim().toLowerCase(), c.id));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.asset_code || !row.asset_name) {
        errors.push(`שורה ${i + 1}: חסרים שדות חובה (${row.asset_name || "ללא שם"})`);
        continue;
      }

      const categoryId = catMap.get((row.category_name ?? "").trim().toLowerCase());
      if (!categoryId) {
        errors.push(`שורה ${i + 1} (${row.asset_name}): קטגוריה "${row.category_name}" לא נמצאה`);
        continue;
      }

      const { error } = await supabase.from("assets").insert({
        asset_code: row.asset_code,
        asset_name: row.asset_name,
        category_id: categoryId,
        serial_number: row.serial_number || null,
        status: (row.status as any) || "in_stock",
        expiry_date: row.expiry_date || null,
        notes: row.notes || null,
        company_id: activeCompanyId,
      });
      if (error) {
        errors.push(`שורה ${i + 1} (${row.asset_name}): ${error.message}`);
      } else {
        success++;
      }
    }

    setResult({ success, failed: errors.length, errors });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["asset-categories"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

    if (success > 0) {
      toast({ title: `${success} פריטים יובאו בהצלחה` });
    }
  };

  const downloadTemplate = () => {
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
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

          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFile}
            />
            <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            {fileName ? (
              <p className="text-sm font-medium text-foreground">{fileName}</p>
            ) : (
              <p className="text-sm text-muted-foreground">לחץ להעלאת קובץ או גרור לכאן</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">xlsx, xls, csv</p>
          </div>

          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                נמצאו <span className="text-primary font-bold">{rows.length}</span> שורות לייבוא
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
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-mono">{r.asset_code}</td>
                        <td className="p-2">{r.asset_name}</td>
                        <td className="p-2">{r.category_name ?? "—"}</td>
                        <td className="p-2">{r.status ?? "במלאי"}</td>
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

              <Button className="w-full gap-2" onClick={handleImport} disabled={importing}>
                {importing ? "מייבא..." : `ייבא ${rows.length} פריטים`}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <CheckCircle className="w-8 h-8 text-success flex-shrink-0" />
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
                      <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
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
