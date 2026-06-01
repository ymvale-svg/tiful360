import { useEffect, useState } from "react";
import { Check, X, AlertCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type PendingAction = { name: string; args: Record<string, any> };

interface Props {
  action: PendingAction;
  loading: boolean;
  onApprove: () => void;
  onReject: () => void;
}

const ACTION_TITLES: Record<string, (a: any) => string> = {
  insert_row: (a) => `הוספת ${TABLE_LABELS[a?.table] ?? a?.table ?? "רשומה"}`,
  update_row: (a) => `עדכון ${TABLE_LABELS[a?.table] ?? a?.table ?? "רשומה"}`,
  delete_row: (a) => `מחיקת ${TABLE_LABELS[a?.table] ?? a?.table ?? "רשומה"}`,
  create_employee: () => "יצירת עובד חדש",
  create_it_ticket: () => "פתיחת פניית IT",
  approve_leave_request: () => "עדכון סטטוס בקשת חופשה",
  close_it_ticket: () => "סגירת פניית IT",
};

const TABLE_LABELS: Record<string, string> = {
  assets: "נכס",
  employees: "עובד",
  it_tickets: "פניית IT",
  leave_requests: "בקשת חופשה",
  asset_documents: "מסמך מצורף",
};

const FIELD_LABELS: Record<string, string> = {
  asset_name: "שם הנכס",
  asset_code: "מק״ט",
  manufacturer_model: "דגם / יצרן",
  serial_number: "מס׳ סידורי",
  license_plate: "מס׳ רישוי",
  insurance_company: "חברת ביטוח",
  policy_number: "מס׳ פוליסה",
  expiry_date: "תאריך תפוגה",
  insurance_expiry: "תפוגת ביטוח",
  status: "סטטוס",
  notes: "הערות",
  full_name: "שם מלא",
  email: "אימייל",
  phone: "טלפון",
  department: "מחלקה",
  role: "תפקיד",
  id_number: "ת.ז.",
  employee_code: "מס׳ עובד",
  start_date: "תאריך התחלה",
  city: "עיר",
  title: "כותרת",
  ticket_type: "סוג פנייה",
  priority: "עדיפות",
  current_owner_id: "מחזיק (עובד)",
  employee_id: "עובד",
  related_employee_id: "עובד קשור",
  assigned_to: "משויך ל",
  direct_manager_id: "מנהל ישיר",
  category_id: "קטגוריה",
  asset_id: "נכס",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RESOLVERS: Record<string, { table: string; col: string }> = {
  current_owner_id: { table: "employees", col: "full_name" },
  employee_id: { table: "employees", col: "full_name" },
  related_employee_id: { table: "employees", col: "full_name" },
  assigned_to: { table: "employees", col: "full_name" },
  direct_manager_id: { table: "employees", col: "full_name" },
  category_id: { table: "asset_categories", col: "category_name" },
  asset_id: { table: "assets", col: "asset_name" },
};

function formatValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function AiPendingActionCard({ action, loading, onApprove, onReject }: Props) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [showRaw, setShowRaw] = useState(false);

  const args = action.args ?? {};
  const values: Record<string, any> = args.values ?? args;
  const filters = args.filters;
  const title = (ACTION_TITLES[action.name] ?? (() => action.name))(args);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      const tasks: Promise<unknown>[] = [];
      for (const [k, v] of Object.entries(values ?? {})) {
        if (typeof v === "string" && UUID_RE.test(v) && RESOLVERS[k]) {
          const { table, col } = RESOLVERS[k];
          tasks.push(
            (async () => {
              const { data } = await supabase
                .from(table as any)
                .select(col)
                .eq("id", v)
                .maybeSingle();
              const row = data as Record<string, any> | null;
              if (row?.[col]) next[v] = String(row[col]);
            })(),
          );
        }
      }
      await Promise.all(tasks);
      if (!cancelled) setResolved(next);
    })();
    return () => { cancelled = true; };
  }, [values]);

  const entries = Object.entries(values ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );

  return (
    <div
      role="region"
      aria-label="אישור פעולה"
      className="border border-amber-300 dark:border-amber-700 bg-gradient-to-b from-amber-50 to-background dark:from-amber-950/40 dark:to-background rounded-xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/60 dark:bg-amber-900/30 border-b border-amber-200/60 dark:border-amber-800/60">
        <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-300" aria-hidden />
        <p className="text-sm font-semibold text-foreground">נדרש אישור</p>
        <span className="text-xs text-muted-foreground mr-auto">{title}</span>
      </div>

      <dl className="divide-y divide-border/60">
        {entries.length === 0 && (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            ללא פרטים נוספים
          </div>
        )}
        {entries.map(([k, v]) => {
          const label = FIELD_LABELS[k] ?? k;
          let display = formatValue(v);
          if (typeof v === "string" && UUID_RE.test(v)) {
            display = resolved[v] ?? "טוען...";
          }
          return (
            <div
              key={k}
              className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-2 text-sm items-baseline"
            >
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground break-words">{display}</dd>
            </div>
          );
        })}
      </dl>

      {filters && (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border/60 bg-muted/30">
          תנאי בחירה: {JSON.stringify(filters)}
        </div>
      )}

      <button
        onClick={() => setShowRaw((s) => !s)}
        className="w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 flex items-center justify-center gap-1 border-t border-border/60"
        aria-expanded={showRaw}
      >
        {showRaw ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showRaw ? "הסתר פרטים טכניים" : "הצג פרטים טכניים"}
      </button>
      {showRaw && (
        <pre
          dir="ltr"
          className="text-[11px] bg-muted/40 p-2 overflow-x-auto max-h-40 border-t border-border/60"
        >
          {JSON.stringify(args, null, 2)}
        </pre>
      )}

      <div className="flex gap-2 p-3 bg-background border-t border-border/60">
        <button
          onClick={onReject}
          disabled={loading}
          className={cn(
            "flex-1 min-h-11 rounded-lg px-3 text-sm font-medium",
            "bg-muted text-foreground hover:bg-muted/70",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:opacity-50 flex items-center justify-center gap-1.5",
          )}
          aria-label="ביטול הפעולה"
        >
          <X className="w-4 h-4" /> ביטול
        </button>
        <button
          onClick={onApprove}
          disabled={loading}
          autoFocus
          className={cn(
            "flex-[2] min-h-11 rounded-lg px-3 text-sm font-semibold",
            "bg-primary text-primary-foreground hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm",
          )}
          aria-label={`אשר ובצע: ${title}`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          אשר ובצע
        </button>
      </div>
    </div>
  );
}
