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
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "employees" | "users";
}

interface ParsedEmployee {
  employee_code: string;
  full_name: string;
  id_number: string;
  role: string;
  department: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  start_date?: string;
  status?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const EMPLOYEE_COLUMNS = [
  { key: "employee_code", label: "מזהה עובד", required: true },
  { key: "full_name", label: "שם מלא", required: true },
  { key: "id_number", label: "תעודת זהות", required: true },
  { key: "role", label: "תפקיד", required: true },
  { key: "department", label: "מחלקה", required: true },
  { key: "phone", label: "טלפון", required: false },
  { key: "email", label: "דוא\"ל", required: false },
  { key: "birth_date", label: "תאריך לידה", required: false },
  { key: "start_date", label: "תאריך התחלה", required: false },
  { key: "status", label: "סטטוס", required: false },
];

const COLUMN_MAP: Record<string, string> = {
  "מזהה עובד": "employee_code",
  "מזהה": "employee_code",
  "employee_code": "employee_code",
  "code": "employee_code",
  "שם מלא": "full_name",
  "שם": "full_name",
  "full_name": "full_name",
  "name": "full_name",
  "תעודת זהות": "id_number",
  "ת.ז": "id_number",
  "id_number": "id_number",
  "id": "id_number",
  "תפקיד": "role",
  "role": "role",
  "מחלקה": "department",
  "department": "department",
  "טלפון": "phone",
  "phone": "phone",
  "דואל": "email",
  "דוא\"ל": "email",
  "אימייל": "email",
  "email": "email",
  "תאריך לידה": "birth_date",
  "birth_date": "birth_date",
  "תאריך התחלה": "start_date",
  "start_date": "start_date",
  "סטטוס": "status",
  "status": "status",
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

export function ImportExcelDialog({ open, onOpenChange, mode }: Props) {
  const [rows, setRows] = useState<ParsedEmployee[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
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

      const parsed: ParsedEmployee[] = json.map((row) => {
        const mapped: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          const col = normalizeColumnName(key);
          if (col) mapped[col] = String(value ?? "").trim();
        }
        if (mapped.start_date) {
          const originalValue = Object.entries(row).find(([k]) => normalizeColumnName(k) === "start_date")?.[1];
          mapped.start_date = parseExcelDate(originalValue) || mapped.start_date;
        }
        const status = mapped.status?.toLowerCase();
        if (status && ["active", "onboarding", "leaving", "inactive"].includes(status)) {
          mapped.status = status;
        } else {
          mapped.status = "active";
        }
        return mapped as ParsedEmployee;
      }).filter((r) => r.full_name && r.id_number);

      setRows(parsed);
      if (parsed.length === 0) {
        toast({ title: "לא נמצאו שורות תקינות", description: "ודא שהקובץ מכיל עמודות: שם מלא, תעודת זהות, תפקיד, מחלקה", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!activeCompanyId || rows.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.employee_code || !row.full_name || !row.id_number || !row.role || !row.department) {
        errors.push(`שורה ${i + 1}: חסרים שדות חובה (${row.full_name || "ללא שם"})`);
        continue;
      }
      const { error } = await supabase.from("employees").insert({
        employee_code: row.employee_code,
        full_name: row.full_name,
        id_number: row.id_number,
        role: row.role,
        department: row.department,
        phone: row.phone || null,
        email: row.email || null,
        start_date: row.start_date || new Date().toISOString().split("T")[0],
        status: (row.status as any) || "active",
        company_id: activeCompanyId,
      });
      if (error) {
        errors.push(`שורה ${i + 1} (${row.full_name}): ${error.message}`);
      } else {
        success++;
      }
    }

    setResult({ success, failed: errors.length, errors });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

    if (success > 0) {
      toast({ title: `${success} עובדים יובאו בהצלחה` });
    }
  };

  const downloadTemplate = () => {
    const headers = EMPLOYEE_COLUMNS.map((c) => c.label);
    const example = ["EMP-001", "ישראל ישראלי", "123456782", "מהנדס", "הנדסה", "050-1234567", "israel@company.co.il", "2025-01-01", "active"];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const colWidths = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
    ws["!cols"] = colWidths;
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "עובדים");
    XLSX.writeFile(wb, "תבנית_יבוא_עובדים.xlsx");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            יבוא {mode === "employees" ? "עובדים" : "משתמשים"} מאקסל
          </DialogTitle>
          <DialogDescription>
            העלה קובץ Excel (.xlsx / .xls) עם נתוני {mode === "employees" ? "העובדים" : "המשתמשים"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Template download */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">הורד תבנית לדוגמה</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={downloadTemplate}>
              <Download className="w-4 h-4" />
              הורד תבנית
            </Button>
          </div>

          {/* Upload */}
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

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <p className="text-sm font-medium">
                נמצאו <span className="text-primary font-bold">{rows.length}</span> שורות לייבוא
              </p>
              <div className="max-h-48 overflow-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-right">#</th>
                      <th className="p-2 text-right">מזהה</th>
                      <th className="p-2 text-right">שם מלא</th>
                      <th className="p-2 text-right">ת.ז</th>
                      <th className="p-2 text-right">תפקיד</th>
                      <th className="p-2 text-right">מחלקה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{i + 1}</td>
                        <td className="p-2 font-mono">{r.employee_code}</td>
                        <td className="p-2">{r.full_name}</td>
                        <td className="p-2 font-mono">{r.id_number}</td>
                        <td className="p-2">{r.role}</td>
                        <td className="p-2">{r.department}</td>
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
                {importing ? "מייבא..." : `ייבא ${rows.length} עובדים`}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <CheckCircle className="w-8 h-8 text-success flex-shrink-0" />
                <div>
                  <p className="font-medium">{result.success} עובדים יובאו בהצלחה</p>
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
