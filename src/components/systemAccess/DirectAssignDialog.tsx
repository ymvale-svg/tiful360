import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField } from "@/components/feedback/FormField";
import { FileDrop } from "@/components/feedback/FileDrop";
import { useToast } from "@/hooks/use-toast";
import { useEmployees } from "@/hooks/useData";
import { useAccessPickerCatalog, useAccessSystems, useAssignAccessDirect, useHeldGrants } from "@/hooks/useSystemAccess";
import { AccessPicker } from "@/components/systemAccess/AccessPicker";
import { defaultEffectiveLocal, picksToItems, type PickState } from "@/domain/systemAccess/picks";
import { buildSheet, parseSheet, sheetColumns, type ParsedSheet, type SheetEmployee } from "@/domain/systemAccess/assignSheet";
import { loadXlsx } from "@/lib/xlsx";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inputClass = "w-full min-h-10 px-3 bg-background border border-border rounded-lg text-sm";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Initial entry of access employees already hold, by the admin: one employee from the picker, or the
 * whole company from an Excel sheet built from the matrix. Entered access is active at once, from the
 * employee's first day unless another date is given; no request, ticket or approval.
 */
export function DirectAssignDialog({ open, onOpenChange }: Props) {
  const [mode, setMode] = useState<"one" | "excel">("one");
  const assign = useAssignAccessDirect();

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!assign.isPending) onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הזנת הרשאות קיימות</DialogTitle>
          <DialogDescription>
            הזנה חד-פעמית של הרשאות שהעובדים כבר מחזיקים. ההרשאות נרשמות כפעילות מיד, ללא בקשה, אישור או קריאה,
            ובתוקף מיום הקליטה של העובד (אלא אם צוין תאריך אחר). הרשאות שכבר קיימות מדולגות.
          </DialogDescription>
        </DialogHeader>
        <div role="group" aria-label="אופן ההזנה" className="flex gap-1.5">
          <Button size="sm" variant={mode === "one" ? "default" : "outline"} aria-pressed={mode === "one"} onClick={() => setMode("one")}>
            <ShieldCheck className="w-4 h-4" /> עובד אחד
          </Button>
          <Button size="sm" variant={mode === "excel" ? "default" : "outline"} aria-pressed={mode === "excel"} onClick={() => setMode("excel")}>
            <FileSpreadsheet className="w-4 h-4" /> כל החברה מאקסל
          </Button>
        </div>
        {mode === "one" ? <OneEmployee onDone={() => onOpenChange(false)} /> : <FromExcel onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type Emp = SheetEmployee & { role?: string | null };

function OneEmployee({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const assign = useAssignAccessDirect();
  const [employeeId, setEmployeeId] = useState("");
  const [picks, setPicks] = useState<PickState>({});
  const [username, setUsername] = useState("");
  const list = employees as unknown as Emp[];
  const employee = list.find((e) => e.id === employeeId);
  // From the first day, also when it has passed: this records access held since then.
  const defaultFrom = defaultEffectiveLocal(employee?.start_date ?? null);

  const submit = async () => {
    const items = picksToItems(picks, defaultFrom);
    if (!employeeId || items.length === 0) return;
    try {
      const res = await assign.mutateAsync(items.map((i) => ({
        employee_id: employeeId,
        system_id: i.system_id,
        group_id: i.group_id ?? null,
        resource_id: i.resource_id ?? null,
        effective_from: i.effective_from ?? null,
        external_username: username.trim() || null,
      })));
      toast({
        title: "ההרשאות נרשמו",
        description: `${res.grants} הרשאות פעילות ל${employee?.full_name ?? "עובד"}${res.skipped ? ` · ${res.skipped} כבר היו קיימות` : ""}`,
      });
      setPicks({});
      setUsername("");
      setEmployeeId("");
    } catch (e) {
      toast({ title: "ההרשאות לא נרשמו", description: message(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <FormField label="עובד" required>
        <SearchableSelect
          value={employeeId}
          onChange={(v) => { setEmployeeId(v); setPicks({}); }}
          options={list
            .filter((e) => e.status !== "inactive")
            .map((e) => ({ value: e.id, label: `${e.full_name}${e.role ? ` · ${e.role}` : ""}` }))}
        />
      </FormField>
      {employeeId && <AccessPicker value={picks} onChange={setPicks} defaultFrom={defaultFrom} />}
      {employeeId && (
        <FormField label="שם משתמש במערכות (לא חובה)">
          <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" className={inputClass} />
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={assign.isPending}>סגירה</Button>
        <Button
          onClick={() => { void submit(); }}
          disabled={!employeeId || Object.keys(picks).length === 0}
          loading={assign.isPending}
          loadingText="רושם…"
        >
          <ShieldCheck className="w-4 h-4" /> רשום כפעילות
        </Button>
      </div>
    </div>
  );
}

function FromExcel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const { data: systems = [] } = useAccessSystems();
  const { data: catalog } = useAccessPickerCatalog();
  const { data: held = [] } = useHeldGrants();
  const assign = useAssignAccessDirect();
  const [parsed, setParsed] = useState<(ParsedSheet & { fileName: string }) | null>(null);
  const [reading, setReading] = useState(false);
  const list = employees as unknown as Emp[];
  const columns = useMemo(() => sheetColumns(systems, catalog ?? { groups: [], resources: [] }), [systems, catalog]);

  const download = async () => {
    const XLSX = await loadXlsx();
    const aoa = buildSheet(list, columns, held);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = aoa[0].map((h, i) => ({ wch: i === aoa[0].length - 1 ? 38 : Math.min(Math.max(h.length + 2, 10), 32) }));
    const help = XLSX.utils.aoa_to_sheet([
      ["איך ממלאים"],
      ["שורה לכל עובד, עמודה לכל מערכת / קבוצת גישה / סביבה, כמו במטריצת ההרשאות."],
      ["מסמנים V (או X / כן / 1) בכל הרשאה שהעובד מחזיק. הרשאות שכבר רשומות מסומנות מראש ומדולגות בייבוא."],
      ["עמודה בשם המערכת בלבד = הרשאה למערכת כולה."],
      ["'בתוקף מ': תאריך dd/mm/yyyy. ריק = יום הקליטה של העובד (08:00)."],
      ["לא לשנות את העמודה 'מזהה פנימי' ולא את כותרות העמודות. עובד שאין לו סימון – לא ייווצר לו דבר."],
      ["ההרשאות נרשמות כפעילות מיד, ללא בקשה, אישור או קריאה. אין בייבוא ניתוק של הרשאות."],
    ]);
    help["!cols"] = [{ wch: 100 }];
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "הרשאות");
    XLSX.utils.book_append_sheet(wb, help, "הסבר");
    XLSX.writeFile(wb, "תבנית_הזנת_הרשאות.xlsx");
  };

  const read = async (file: File) => {
    setReading(true);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets["הרשאות"] ?? wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const result = parseSheet(records, columns, list, (n) => {
        const d = XLSX.SSF.parse_date_code(n);
        return d ? { y: d.y, m: d.m, d: d.d } : null;
      });
      setParsed({ ...result, fileName: file.name });
    } catch (e) {
      toast({ title: "הקובץ לא נקרא", description: message(e), variant: "destructive" });
    } finally {
      setReading(false);
    }
  };

  const apply = async () => {
    if (!parsed || parsed.rows.length === 0) return;
    try {
      const res = await assign.mutateAsync(parsed.rows);
      toast({
        title: "ההרשאות יובאו",
        description: `${res.grants} הרשאות פעילות ל-${res.employees} עובדים${res.skipped ? ` · ${res.skipped} כבר היו קיימות ודולגו` : ""}`,
      });
      setParsed(null);
      onDone();
    } catch (e) {
      toast({ title: "הייבוא לא בוצע", description: `${message(e)}. דבר לא נשמר.`, variant: "destructive" });
    }
  };

  if (columns.length === 0) {
    return <p className="text-sm text-muted-foreground">עוד לא הוגדרו מערכות פעילות. מגדירים אותן בלשונית מערכות וסביבות.</p>;
  }

  return (
    <div className="space-y-4">
      <ol className="text-sm space-y-1 list-decimal ps-5 text-muted-foreground">
        <li>מורידים את התבנית: שורה לכל עובד ועמודה לכל הרשאה במטריצה.</li>
        <li>מסמנים V בכל הרשאה שהעובד מחזיק (ותאריך, אם לא מיום הקליטה).</li>
        <li>מעלים את הקובץ, בודקים את הסיכום ומאשרים.</li>
      </ol>
      <Button variant="outline" onClick={() => { void download(); }}>
        <Download className="w-4 h-4" /> הורדת תבנית ({columns.length} עמודות הרשאה)
      </Button>
      <FileDrop
        accept=".xlsx,.xls,.csv"
        onFiles={(files) => { void read(files[0]); }}
        disabled={reading || assign.isPending}
        title="גררו את הקובץ המלא לכאן או לחצו לבחירה"
        hint="xlsx / xls / csv"
      />
      {parsed && (
        <div className="rounded-lg border border-border p-3 space-y-2 text-sm" role="status">
          <p className="font-medium">{parsed.fileName}</p>
          <p>{parsed.rows.length} הרשאות ל-{parsed.employees} עובדים מוכנות לרישום.</p>
          {parsed.unknownColumns.length > 0 && (
            <p className="text-warning">עמודות שלא זוהו ולא ייובאו: {parsed.unknownColumns.join(", ")}</p>
          )}
          {parsed.errors.length > 0 && (
            <div className="text-destructive">
              <p>שורות עם בעיה (לא ייובאו):</p>
              <ul className="list-disc ps-5 max-h-40 overflow-y-auto">
                {parsed.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={assign.isPending}>סגירה</Button>
        <Button
          onClick={() => { void apply(); }}
          disabled={!parsed || parsed.rows.length === 0}
          loading={assign.isPending}
          loadingText="מייבא…"
        >
          <ShieldCheck className="w-4 h-4" /> ייבא ורשום כפעילות
        </Button>
      </div>
    </div>
  );
}
