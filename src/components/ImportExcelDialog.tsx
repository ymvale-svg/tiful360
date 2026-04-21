import { useState, useRef, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useData";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
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
  system_role?: string;
  direct_manager?: string; // raw lookup string
  exclude_from_contacts?: boolean;
  // Resolved during preview
  _resolved_manager_id?: string | null;
  _manager_warning?: string;
  _row_errors?: string[];
}

interface ImportResult {
  success: number;
  failed: number;
  invited: number;
  inviteFailed: number;
  errors: string[];
}

const VALID_ROLES: AppRole[] = ["admin", "it_manager", "employee", "super_admin", "direct_manager", "payroll", "operations"];
const OPERATIONS_BLOCKED: AppRole[] = ["admin", "payroll", "super_admin"];

const EMPLOYEE_COLUMNS = [
  { key: "employee_code", label: "מזהה עובד", required: true },
  { key: "full_name", label: "שם מלא", required: true },
  { key: "id_number", label: "תעודת זהות", required: true },
  { key: "role", label: "תפקיד", required: true },
  { key: "department", label: "מחלקה", required: true },
  { key: "email", label: "דוא\"ל", required: true },
  { key: "phone", label: "טלפון", required: false },
  { key: "birth_date", label: "תאריך לידה", required: false },
  { key: "start_date", label: "תאריך התחלה", required: false },
  { key: "status", label: "סטטוס", required: false },
  { key: "system_role", label: "תפקיד מערכת", required: false },
  { key: "direct_manager", label: "מנהל ישיר", required: false },
  { key: "exclude_from_contacts", label: "הסתר מאנשי קשר", required: false },
];

const COLUMN_MAP: Record<string, string> = {
  "מזהה עובד": "employee_code", "מזהה": "employee_code", "employee_code": "employee_code", "code": "employee_code",
  "שם מלא": "full_name", "שם": "full_name", "full_name": "full_name", "name": "full_name",
  "תעודת זהות": "id_number", "ת.ז": "id_number", "id_number": "id_number", "id": "id_number",
  "תפקיד": "role", "role": "role",
  "מחלקה": "department", "department": "department",
  "טלפון": "phone", "phone": "phone",
  "דואל": "email", "דוא\"ל": "email", "אימייל": "email", "email": "email",
  "תאריך לידה": "birth_date", "birth_date": "birth_date",
  "תאריך התחלה": "start_date", "start_date": "start_date",
  "סטטוס": "status", "status": "status",
  "תפקיד מערכת": "system_role", "system_role": "system_role",
  "מנהל ישיר": "direct_manager", "direct_manager": "direct_manager", "manager": "direct_manager",
  "הסתר מאנשי קשר": "exclude_from_contacts", "exclude_from_contacts": "exclude_from_contacts",
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

function parseBool(v: any): boolean {
  if (v === true) return true;
  const s = String(v ?? "").trim().toLowerCase();
  return ["true", "1", "yes", "כן", "v", "x"].includes(s);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function ImportExcelDialog({ open, onOpenChange, mode }: Props) {
  const [rows, setRows] = useState<ParsedEmployee[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [autoInvite, setAutoInvite] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { activeCompanyId } = useCompany();
  const { isOperations, isAdmin, isSuperAdmin } = useAuth();
  const { data: existingEmployees = [] } = useEmployees();
  const queryClient = useQueryClient();

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
  };

  // Build manager lookup index from existing employees
  const managerIndex = useMemo(() => {
    const byName = new Map<string, string>();
    const byCode = new Map<string, string>();
    for (const e of existingEmployees as any[]) {
      if (e.full_name) byName.set(e.full_name.trim().toLowerCase(), e.id);
      if (e.employee_code) byCode.set(e.employee_code.trim().toLowerCase(), e.id);
    }
    return { byName, byCode };
  }, [existingEmployees]);

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
        if (mapped.birth_date) {
          const originalValue = Object.entries(row).find(([k]) => normalizeColumnName(k) === "birth_date")?.[1];
          mapped.birth_date = parseExcelDate(originalValue) || mapped.birth_date;
        }
        const status = mapped.status?.toLowerCase();
        mapped.status = status && ["active", "onboarding", "leaving", "inactive"].includes(status) ? status : "active";

        // system_role default + validation
        const sr = (mapped.system_role || "").toLowerCase();
        mapped.system_role = VALID_ROLES.includes(sr as AppRole) ? sr : "employee";

        // exclude_from_contacts as boolean
        mapped.exclude_from_contacts = parseBool(mapped.exclude_from_contacts);

        return mapped as ParsedEmployee;
      }).filter((r) => r.full_name && r.id_number);

      // Resolve managers (lookup against existing employees)
      const enriched = parsed.map((r) => {
        const errs: string[] = [];
        if (!r.email) errs.push("חסר דוא\"ל");
        else if (!isValidEmail(r.email)) errs.push("דוא\"ל לא תקין");

        if (isOperations && !isAdmin && !isSuperAdmin && OPERATIONS_BLOCKED.includes(r.system_role as AppRole)) {
          errs.push(`אין הרשאה לתפקיד מערכת "${r.system_role}"`);
        }

        let resolved: string | null = null;
        let warning: string | undefined;
        if (r.direct_manager && r.direct_manager.trim()) {
          const key = r.direct_manager.trim().toLowerCase();
          resolved = managerIndex.byCode.get(key) ?? managerIndex.byName.get(key) ?? null;
          if (!resolved) warning = `מנהל "${r.direct_manager}" לא נמצא — ינסה שוב לאחר ייבוא`;
        }
        return { ...r, _resolved_manager_id: resolved, _manager_warning: warning, _row_errors: errs };
      });

      setRows(enriched);
      if (enriched.length === 0) {
        toast({
          title: "לא נמצאו שורות תקינות",
          description: "ודא שהקובץ מכיל עמודות: שם מלא, תעודת זהות, תפקיד, מחלקה, דוא\"ל",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!activeCompanyId || rows.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let success = 0;
    const inserted: Array<{ id: string; email: string; full_name: string; row: ParsedEmployee }> = [];
    // Track names from this file to resolve self-references in second pass
    const namesInFile = new Map<string, string>(); // lowercase name -> employee id
    const codesInFile = new Map<string, string>();

    // Pass 1: insert employees
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row._row_errors && row._row_errors.length > 0) {
        errors.push(`שורה ${i + 1} (${row.full_name}): ${row._row_errors.join(", ")}`);
        continue;
      }
      if (!row.employee_code || !row.full_name || !row.id_number || !row.role || !row.department) {
        errors.push(`שורה ${i + 1}: חסרים שדות חובה (${row.full_name || "ללא שם"})`);
        continue;
      }

      const { data, error } = await supabase.from("employees").insert({
        employee_code: row.employee_code,
        full_name: row.full_name,
        id_number: row.id_number,
        role: row.role,
        department: row.department,
        phone: row.phone || null,
        email: row.email || null,
        birth_date: row.birth_date || null,
        start_date: row.start_date || new Date().toISOString().split("T")[0],
        status: (row.status as any) || "active",
        company_id: activeCompanyId,
        direct_manager_id: row._resolved_manager_id || null,
        exclude_from_contacts: !!row.exclude_from_contacts,
      } as any).select("id").single();

      if (error) {
        errors.push(`שורה ${i + 1} (${row.full_name}): ${error.message}`);
      } else if (data) {
        success++;
        inserted.push({ id: data.id, email: row.email || "", full_name: row.full_name, row });
        namesInFile.set(row.full_name.trim().toLowerCase(), data.id);
        codesInFile.set(row.employee_code.trim().toLowerCase(), data.id);
      }
    }

    // Pass 2: resolve managers that were in the same file
    for (const ins of inserted) {
      if (ins.row._resolved_manager_id) continue;
      const raw = ins.row.direct_manager?.trim().toLowerCase();
      if (!raw) continue;
      const mgrId = codesInFile.get(raw) ?? namesInFile.get(raw);
      if (mgrId && mgrId !== ins.id) {
        await supabase.from("employees").update({ direct_manager_id: mgrId }).eq("id", ins.id);
      }
    }

    // Pass 3: send invitations (if enabled)
    let invited = 0;
    let inviteFailed = 0;
    if (autoInvite && inserted.length > 0) {
      // Group by system_role for efficiency
      const byRole = new Map<string, typeof inserted>();
      for (const ins of inserted) {
        const role = (ins.row.system_role as string) || "employee";
        if (!byRole.has(role)) byRole.set(role, []);
        byRole.get(role)!.push(ins);
      }

      for (const [role, group] of byRole) {
        try {
          const { data: inviteResult, error: inviteErr } = await supabase.functions.invoke("manage-users?action=invite", {
            body: {
              company_id: activeCompanyId,
              role,
              employees: group
                .filter((g) => g.email && isValidEmail(g.email))
                .map((g) => ({ employee_id: g.id, email: g.email, full_name: g.full_name })),
            },
          });
          if (inviteErr) throw inviteErr;
          for (const r of inviteResult?.results ?? []) {
            if (r.status === "invited" || r.status === "already_exists") invited++;
            else if (r.status === "failed") {
              inviteFailed++;
              errors.push(`הזמנה (${r.email}): ${r.error || "נכשל"}`);
            }
          }
        } catch (e: any) {
          inviteFailed += group.length;
          errors.push(`שליחת הזמנות לקבוצה "${role}" נכשלה: ${e.message || "שגיאה"}`);
        }
      }
    }

    setResult({ success, failed: errors.length, invited, inviteFailed, errors });
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

    if (success > 0) {
      toast({ title: `${success} עובדים יובאו בהצלחה${invited > 0 ? ` • ${invited} הזמנות נשלחו` : ""}` });
    }
  };

  const downloadTemplate = () => {
    if (mode === "employees") {
      const headers = EMPLOYEE_COLUMNS.map((c) => c.label);
      const example = [
        "EMP-001", "ישראל ישראלי", "123456782", "מהנדס", "הנדסה",
        "israel@company.co.il", "050-1234567", "1990-05-12", "2025-01-01",
        "active", "employee", "EMP-002", "false",
      ];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 14) }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, "עובדים");
      XLSX.writeFile(wb, "תבנית_יבוא_עובדים.xlsx");
    } else {
      const headers = ["דוא\"ל", "שם מלא", "תפקיד מערכת"];
      const example = ["user@company.co.il", "ישראל ישראלי", "employee"];
      const ws = XLSX.utils.aoa_to_sheet([headers, example]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }));
      const wb = XLSX.utils.book_new();
      wb.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(wb, ws, "משתמשים");
      XLSX.writeFile(wb, "תבנית_יבוא_משתמשים.xlsx");
    }
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
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  נמצאו <span className="text-primary font-bold">{rows.length}</span> שורות
                </p>
                {mode === "employees" && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>שלח הזמנות אוטומטית</span>
                    <Switch checked={autoInvite} onCheckedChange={setAutoInvite} />
                  </div>
                )}
              </div>

              <div className="max-h-56 overflow-auto border border-border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-right">#</th>
                      <th className="p-2 text-right">שם</th>
                      <th className="p-2 text-right">דוא"ל</th>
                      <th className="p-2 text-right">מנהל</th>
                      <th className="p-2 text-right">תפקיד מערכת</th>
                      <th className="p-2 text-right">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 20).map((r, i) => {
                      const hasErr = (r._row_errors?.length ?? 0) > 0;
                      return (
                        <tr key={i} className={`border-t border-border ${hasErr ? "bg-destructive/5" : ""}`}>
                          <td className="p-2 text-muted-foreground">{i + 1}</td>
                          <td className="p-2">{r.full_name}</td>
                          <td className="p-2 font-mono text-[10px]" dir="ltr">{r.email || "—"}</td>
                          <td className="p-2">
                            {r.direct_manager ? (
                              r._resolved_manager_id ? (
                                <span className="text-success">✓ {r.direct_manager}</span>
                              ) : (
                                <span className="text-warning text-[10px]">⚠ {r.direct_manager}</span>
                              )
                            ) : "—"}
                          </td>
                          <td className="p-2">{r.system_role}</td>
                          <td className="p-2">
                            {hasErr ? (
                              <span className="text-destructive text-[10px]">{r._row_errors!.join(", ")}</span>
                            ) : (
                              <span className="text-success text-[10px]">תקין</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    ועוד {rows.length - 20} שורות...
                  </p>
                )}
              </div>

              <Button className="w-full gap-2" onClick={handleImport} disabled={importing}>
                {importing ? "מייבא..." : `ייבא ${rows.length} עובדים${autoInvite ? " + שלח הזמנות" : ""}`}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <CheckCircle className="w-8 h-8 text-success flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">{result.success} עובדים יובאו בהצלחה</p>
                  {result.invited > 0 && (
                    <p className="text-xs text-muted-foreground">{result.invited} הזמנות נשלחו / קושרו למשתמש קיים</p>
                  )}
                  {result.failed > 0 && (
                    <p className="text-sm text-destructive">{result.failed} שגיאות</p>
                  )}
                  {result.inviteFailed > 0 && (
                    <p className="text-sm text-destructive">{result.inviteFailed} הזמנות נכשלו</p>
                  )}
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-40 overflow-auto border border-destructive/20 rounded-lg p-3 space-y-1">
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
