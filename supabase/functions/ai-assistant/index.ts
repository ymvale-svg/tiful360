// AI Assistant Edge Function — Lovable AI Gateway + schema-aware generic tools
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("LOVABLE_AI_MODEL")?.trim() || "google/gemini-2.5-flash";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ============================================================
// Schema description — whitelist of tables + columns the agent
// can read/filter on, with Hebrew descriptions and enum values.
// ============================================================
type ColumnDef = { name: string; type: string; desc: string; enum?: string[] };
type TableDef = {
  table: string;
  desc: string;
  columns: ColumnDef[];
  writable?: string[]; // columns allowed in insert_row
  requireCompany?: boolean;
};

const SCHEMA: TableDef[] = [
  {
    table: "employees",
    desc: "עובדים בחברה",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה ייחודי" },
      { name: "employee_code", type: "text", desc: "מספר עובד" },
      { name: "full_name", type: "text", desc: "שם מלא" },
      { name: "role", type: "text", desc: "תפקיד" },
      { name: "department", type: "text", desc: "מחלקה" },
      { name: "status", type: "enum", desc: "סטטוס עובד", enum: ["active", "inactive", "terminated", "on_leave"] },
      { name: "start_date", type: "date", desc: "תאריך תחילת עבודה" },
      { name: "end_date", type: "date", desc: "תאריך סיום עבודה" },
      { name: "phone", type: "text", desc: "טלפון" },
      { name: "email", type: "text", desc: "אימייל" },
      { name: "direct_manager_id", type: "uuid", desc: "מזהה המנהל הישיר (FK ל-employees.id)" },
      { name: "birth_date", type: "date", desc: "תאריך לידה" },
      { name: "vacation_balance", type: "number", desc: "יתרת ימי חופשה" },
      { name: "sick_balance", type: "number", desc: "יתרת ימי מחלה" },
      { name: "gender", type: "text", desc: "מגדר" },
      { name: "city", type: "text", desc: "עיר מגורים" },
      { name: "street", type: "text", desc: "רחוב" },
      { name: "house_number", type: "text", desc: "מספר בית" },
      { name: "marital_status", type: "text", desc: "מצב משפחתי" },
      { name: "is_israeli_resident", type: "boolean", desc: "תושב ישראל" },
      { name: "health_fund_member", type: "boolean", desc: "חבר קופ\"ח" },
    ],
    writable: ["full_name", "email", "phone", "department", "role", "id_number", "employee_code", "start_date"],
  },
  {
    table: "assets",
    desc: "נכסים / ציוד / רכבים / משתמשים דיגיטליים",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "asset_code", type: "text", desc: "מק\"ט נכס" },
      { name: "asset_name", type: "text", desc: "שם הנכס" },
      { name: "category_id", type: "uuid", desc: "קטגוריה (FK ל-asset_categories)" },
      { name: "group_id", type: "uuid", desc: "קבוצה (FK ל-asset_groups)" },
      { name: "serial_number", type: "text", desc: "מספר סידורי" },
      { name: "manufacturer_model", type: "text", desc: "יצרן/דגם" },
      { name: "current_owner_id", type: "uuid", desc: "מי מחזיק בנכס (FK ל-employees.id)" },
      { name: "status", type: "enum", desc: "סטטוס נכס", enum: ["in_stock", "assigned", "maintenance", "lost", "retired"] },
      { name: "condition", type: "text", desc: "מצב פיזי (good/fair/broken וכו')" },
      { name: "expiry_date", type: "date", desc: "תאריך תפוגה כללי" },
      { name: "notification_days_before", type: "integer", desc: "כמה ימים מראש להתריע" },
      { name: "notes", type: "text", desc: "הערות" },
      { name: "license_plate", type: "text", desc: "מספר רישוי (רכב)" },
      { name: "vehicle_type", type: "text", desc: "סוג רכב" },
      { name: "fuel_type", type: "text", desc: "סוג דלק" },
      { name: "year_of_manufacture", type: "integer", desc: "שנת ייצור" },
      { name: "current_km", type: "integer", desc: "ק\"מ נוכחי" },
      { name: "test_expiry", type: "date", desc: "תפוגת טסט רכב" },
      { name: "insurance_expiry", type: "date", desc: "תפוגת ביטוח" },
      { name: "license_expiry", type: "date", desc: "תפוגת רישיון" },
      { name: "insurance_company", type: "text", desc: "חברת ביטוח" },
      { name: "insurance_policy_number", type: "text", desc: "מס' פוליסת ביטוח" },
      { name: "account_username", type: "text", desc: "שם משתמש (חשבון דיגיטלי)" },
      { name: "account_url", type: "text", desc: "כתובת חשבון" },
      { name: "mfa_enabled", type: "boolean", desc: "האם הופעל MFA" },
      { name: "password_expires_at", type: "date", desc: "תפוגת סיסמה" },
      { name: "license_expires_at", type: "date", desc: "תפוגת רישיון תוכנה" },
    ],
  },
  {
    table: "asset_categories",
    desc: "קטגוריות של נכסים",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "category_name", type: "text", desc: "שם הקטגוריה" },
      { name: "prefix", type: "text", desc: "תחילית מק\"ט" },
      { name: "description", type: "text", desc: "תיאור" },
      { name: "is_assignable", type: "boolean", desc: "ניתן להקצאה לעובד" },
      { name: "domain", type: "text", desc: "תחום (physical/digital/institutional)" },
    ],
  },
  {
    table: "asset_groups",
    desc: "קבוצות בתוך קטגוריות נכסים",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "name", type: "text", desc: "שם הקבוצה" },
      { name: "category_id", type: "uuid", desc: "FK ל-asset_categories" },
      { name: "description", type: "text", desc: "תיאור" },
    ],
  },
  {
    table: "it_tickets",
    desc: "פניות IT",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "ticket_code", type: "text", desc: "מספר פנייה" },
      { name: "title", type: "text", desc: "כותרת" },
      { name: "ticket_type", type: "enum", desc: "סוג פנייה", enum: ["incident", "request", "question"] },
      { name: "priority", type: "enum", desc: "קדימות", enum: ["low", "medium", "high", "urgent"] },
      { name: "status", type: "enum", desc: "סטטוס", enum: ["open", "in_progress", "resolved", "closed"] },
      { name: "employee_id", type: "uuid", desc: "מבקש הפנייה" },
      { name: "assigned_to", type: "uuid", desc: "משויך ל" },
      { name: "sla_deadline", type: "timestamptz", desc: "דדליין SLA" },
      { name: "resolved_at", type: "timestamptz", desc: "מתי נסגרה" },
      { name: "created_at", type: "timestamptz", desc: "מתי נוצרה" },
    ],
    writable: ["title", "ticket_type", "priority", "employee_id"],
  },
  {
    table: "leave_requests",
    desc: "בקשות חופשה/מחלה",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "employee_id", type: "uuid", desc: "עובד" },
      { name: "request_type", type: "text", desc: "סוג בקשה (vacation/sick/...)" },
      { name: "start_date", type: "date", desc: "תאריך התחלה" },
      { name: "end_date", type: "date", desc: "תאריך סיום" },
      { name: "total_days", type: "number", desc: "סך ימים" },
      { name: "reason", type: "text", desc: "סיבה" },
      { name: "status", type: "enum", desc: "סטטוס", enum: ["pending", "approved", "rejected", "canceled"] },
      { name: "manager_note", type: "text", desc: "הערת מנהל" },
      { name: "reviewed_at", type: "timestamptz", desc: "מתי אושר/נדחה" },
      { name: "created_at", type: "timestamptz", desc: "מתי נוצרה הבקשה" },
    ],
  },
  {
    table: "alerts",
    desc: "התראות מערכת",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה" },
      { name: "title", type: "text", desc: "כותרת" },
      { name: "category", type: "text", desc: "קטגוריה" },
      { name: "severity", type: "enum", desc: "חומרה", enum: ["info", "warning", "critical"] },
      { name: "target_date", type: "date", desc: "תאריך יעד" },
      { name: "related_asset_id", type: "uuid", desc: "נכס קשור" },
      { name: "related_employee_id", type: "uuid", desc: "עובד קשור" },
      { name: "is_resolved", type: "boolean", desc: "האם טופל" },
      { name: "created_at", type: "timestamptz", desc: "מתי נוצרה" },
    ],
  },
];

function getTableDef(name: string): TableDef | undefined {
  return SCHEMA.find((t) => t.table === name);
}

function schemaPromptBlock(): string {
  return SCHEMA.map((t) => {
    const cols = t.columns
      .map((c) => {
        const enumStr = c.enum ? ` [ערכים: ${c.enum.join(" | ")}]` : "";
        return `  - ${c.name} (${c.type}): ${c.desc}${enumStr}`;
      })
      .join("\n");
    return `### ${t.table} — ${t.desc}\n${cols}`;
  }).join("\n\n");
}

// ============================================================
// Tools (OpenAI-compatible)
// ============================================================
const tools = [
  {
    type: "function",
    function: {
      name: "query_table",
      description:
        "שאילתת קריאה גנרית על טבלה. השתמש בו כדי לענות על כל שאלה על נתונים. תרגם את שאלת המשתמש לעמודות מהסכימה. עדיף ilike על eq לטקסט חופשי. company_id נאכף אוטומטית.",
      parameters: {
        type: "object",
        required: ["table"],
        properties: {
          table: { type: "string", description: "שם הטבלה מהסכימה" },
          select: {
            type: "array",
            items: { type: "string" },
            description: "עמודות להחזיר. אם לא צוין — מחזיר סט ברירת מחדל קטן.",
          },
          filters: {
            type: "array",
            description: "מסננים. כל פריט: {column, op, value}. op: eq | neq | gt | gte | lt | lte | ilike | in | is_null | not_null | between. ל-between value הוא מערך [start, end]. ל-in value הוא מערך. ל-ilike השרת עוטף ב-%% אוטומטית.",
            items: {
              type: "object",
              required: ["column", "op"],
              properties: {
                column: { type: "string" },
                op: { type: "string" },
                value: {},
              },
            },
          },
          order_by: {
            type: "object",
            properties: {
              column: { type: "string" },
              ascending: { type: "boolean" },
            },
          },
          limit: { type: "integer", description: "ברירת מחדל 20, מקסימום 50" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_table",
      description:
        "מחזיר את רשימת העמודות וערכים נפוצים (DISTINCT) של טבלה. השתמש כשאתה לא בטוח באיזה ערך/עמודה להשתמש.",
      parameters: {
        type: "object",
        required: ["table"],
        properties: {
          table: { type: "string" },
          sample_columns: {
            type: "array",
            items: { type: "string" },
            description: "עמודות שתרצה לראות עבורן ערכים מובחנים (עד 20 ערכים לכל אחת).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insert_row",
      description: "הוספת שורה חדשה לטבלה. דורש אישור משתמש.",
      parameters: {
        type: "object",
        required: ["table", "values"],
        properties: {
          table: { type: "string" },
          values: { type: "object" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_row",
      description: "עדכון שורה לפי id. דורש אישור משתמש.",
      parameters: {
        type: "object",
        required: ["table", "id", "values"],
        properties: {
          table: { type: "string" },
          id: { type: "string" },
          values: { type: "object" },
        },
      },
    },
  },
];

const WRITE_ACTIONS = new Set(["insert_row", "update_row"]);

function baseSystemPrompt(catalog: string): string {
  return `אתה "תפעול AI" — עוזר חכם במערכת ניהול משאבי אנוש ונכסים.

## הנחיות תקשורת
- ענה בעברית, קצר ולעניין.
- השתמש ב-Markdown (טבלאות/רשימות) להצגת נתונים.
- היום הוא ${new Date().toISOString().slice(0, 10)}.

## כלל קריטי — אפס המצאות
- כל ערך שאתה מציג חייב להגיע *ישירות* מתוצאת query_table באותה שיחה. שמות, מספרים, תאריכים — הכל מהכלי בלבד.
- אם הכלי החזיר ריק — אמור "לא מצאתי" והסבר מה ניסית. אסור לנחש או למלא בערכים סבירים.
- מספר השורות בתשובה = בדיוק מספר השורות מהכלי.

## כלל קריטי — אל תשאל, חפש
- **אסור** לשאול את המשתמש שאלת הבהרה על מיפוי בין מילה בעברית לעמודה/קטגוריה. **הקטלוג של החברה למטה — חפש שם.**
- **אסור** לשאול "האם התכוונת ל-X או Y". במקום זה: הרץ ilike רחב שמכסה את כל החלופות, והצג את כל מה שיצא.
- שאלת הבהרה מותרת **רק** אם: (א) השאילתה החזירה 0 גם אחרי שהרחבת ilike, **או** (ב) צריך אישור לפעולת כתיבה.

## כללי חיפוש נכסים
- סיווג נכסים מתבצע דרך \`assets.category_id → asset_categories\` (ולא דרך טקסט חופשי על assets). **תמיד** השתמש בקטלוג למטה כדי לקבל את ה-id-ים, אל תריץ שאילתה על asset_categories עבור שם שכבר מופיע בקטלוג.
- domains קיימים: \`physical\`, \`digital\`, \`licenses\`, \`insurance\`, \`real_estate\`, \`training\`.

### דוגמאות מחשבה → כלי
- "כל המחשבים הניידים" → query_table assets, filter \`category_id in [<id מהקטלוג>]\`.
- "כל הנכסים הפיזיים" → query_table assets, filter \`category_id in [<כל ה-id-ים עם domain=physical מהקטלוג>]\`.
- "מי מחזיק רכבים" → query_table assets filter \`category_id in [<id רכב>]\` → ואז query_table employees filter \`id in [<current_owner_id-ים>]\` להבאת השמות.
- "ביטוח שפג" → assets עם \`insurance_expiry lt היום\`.

## חיפושים כלליים
- העדף **ilike** על eq עבור טקסט בעברית.
- "מי גר ב..." → employees \`city ilike '%X%'\`.
- "המנהל של X" → קודם employees לפי שם, ואז employees נוסף לפי \`direct_manager_id\`.
- describe_table — רק לעמודות שאינן בקטלוג למטה.

## פעולות כתיבה
- insert_row / update_row — תאר בקצרה ועצור לאישור.

${catalog}

## סכימת טבלאות
${schemaPromptBlock()}
`;
}

// ============================================================
// Execution
// ============================================================
const ALLOWED_OPS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "ilike", "in", "is_null", "not_null", "between",
]);

function applyFilter(q: any, f: { column: string; op: string; value?: any }, allowedCols: Set<string>) {
  if (!allowedCols.has(f.column)) throw new Error(`עמודה לא מותרת: ${f.column}`);
  if (!ALLOWED_OPS.has(f.op)) throw new Error(`אופרטור לא נתמך: ${f.op}`);
  switch (f.op) {
    case "eq": return q.eq(f.column, f.value);
    case "neq": return q.neq(f.column, f.value);
    case "gt": return q.gt(f.column, f.value);
    case "gte": return q.gte(f.column, f.value);
    case "lt": return q.lt(f.column, f.value);
    case "lte": return q.lte(f.column, f.value);
    case "ilike": {
      const v = String(f.value ?? "");
      const pattern = v.includes("%") ? v : `%${v}%`;
      return q.ilike(f.column, pattern);
    }
    case "in": {
      const arr = Array.isArray(f.value) ? f.value : [f.value];
      return q.in(f.column, arr);
    }
    case "is_null": return q.is(f.column, null);
    case "not_null": return q.not(f.column, "is", null);
    case "between": {
      const [start, end] = Array.isArray(f.value) ? f.value : [null, null];
      return q.gte(f.column, start).lte(f.column, end);
    }
  }
  return q;
}

async function executeTool(name: string, args: any, supabase: any, companyId: string | null) {
  try {
    if (name === "query_table") {
      const def = getTableDef(args?.table);
      if (!def) return { error: `טבלה לא מוכרת: ${args?.table}` };
      const allowedCols = new Set(def.columns.map((c) => c.name));
      const select = Array.isArray(args.select) && args.select.length
        ? args.select.filter((c: string) => allowedCols.has(c))
        : def.columns.slice(0, 12).map((c) => c.name);
      if (!select.length) return { error: "לא נבחרו עמודות תקפות" };

      const lim = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);
      let q = supabase.from(def.table).select(select.join(",")).limit(lim);
      if (def.requireCompany && companyId) q = q.eq("company_id", companyId);

      for (const f of args.filters ?? []) {
        q = applyFilter(q, f, allowedCols);
      }
      if (args.order_by?.column && allowedCols.has(args.order_by.column)) {
        q = q.order(args.order_by.column, { ascending: args.order_by.ascending !== false });
      }

      const { data, error } = await q;
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, results: data };
    }

    if (name === "describe_table") {
      const def = getTableDef(args?.table);
      if (!def) return { error: `טבלה לא מוכרת: ${args?.table}` };
      const allowedCols = new Set(def.columns.map((c) => c.name));
      const samples: Record<string, unknown[]> = {};
      for (const col of (args.sample_columns ?? []) as string[]) {
        if (!allowedCols.has(col)) continue;
        let q = supabase.from(def.table).select(col).not(col, "is", null).limit(100);
        if (def.requireCompany && companyId) q = q.eq("company_id", companyId);
        const { data } = await q;
        const uniq = Array.from(new Set((data ?? []).map((r: any) => r[col]))).slice(0, 20);
        samples[col] = uniq;
      }
      return { table: def.table, columns: def.columns, samples };
    }

    if (name === "insert_row") {
      const def = getTableDef(args?.table);
      if (!def?.writable?.length) return { error: `אין הרשאה להוסיף לטבלה ${args?.table}` };
      const values: Record<string, unknown> = {};
      for (const k of def.writable) {
        if (k in (args.values ?? {})) values[k] = args.values[k];
      }
      if (def.requireCompany) {
        if (!companyId) return { error: "לא נבחרה חברה" };
        values["company_id"] = companyId;
      }
      const { data, error } = await supabase.from(def.table).insert(values).select().single();
      return error ? { error: error.message } : { success: true, row: data };
    }

    if (name === "update_row") {
      const def = getTableDef(args?.table);
      if (!def?.writable?.length) return { error: `אין הרשאה לעדכן בטבלה ${args?.table}` };
      if (!args?.id) return { error: "חסר id" };
      const values: Record<string, unknown> = {};
      for (const k of def.writable) {
        if (k in (args.values ?? {})) values[k] = args.values[k];
      }
      const { data, error } = await supabase.from(def.table).update(values).eq("id", args.id).select().single();
      return error ? { error: error.message } : { success: true, row: data };
    }

    return { error: `כלי לא ידוע: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

function parseToolArgs(rawArgs: unknown) {
  if (!rawArgs) return {};
  if (typeof rawArgs === "object") return rawArgs;
  try { return JSON.parse(String(rawArgs)); } catch { return {}; }
}

class GatewayError extends Error {
  status: number;
  payload: any;
  constructor(status: number, payload: any) {
    const message = payload?.error?.message ?? (typeof payload === "string" ? payload : JSON.stringify(payload));
    super(`Lovable AI ${status}: ${message}`);
    this.status = status;
    this.payload = payload;
  }
}

function gatewayErrorMessage(error: GatewayError) {
  if (error.status === 429) return "הגעת למגבלת קצב של Lovable AI. נסה שוב בעוד רגע.";
  if (error.status === 402) return "נגמרו הקרדיטים של Lovable AI. הוסף קרדיטים בהגדרות Workspace → Usage.";
  return `שגיאת Lovable AI (${error.status}): ${error.payload?.error?.message ?? "הבקשה נכשלה"}`;
}

async function callGateway(messages: any[]) {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY!,
      "X-Lovable-AIG-SDK": "edge-function",
    },
    body: JSON.stringify({ model: MODEL, messages, tools }),
  });
  if (res.ok) return await res.json();
  const text = await res.text();
  let payload: any = text;
  try { payload = JSON.parse(text); } catch { /* keep */ }
  throw new GatewayError(res.status, payload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY חסר" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { messages, companyId, approvedAction } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      companyId?: string | null;
      approvedAction?: { name: string; args: any } | null;
    };

    const conv: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    if (approvedAction) {
      const result = await executeTool(approvedAction.name, approvedAction.args, supabase, companyId ?? null);
      conv.push({
        role: "user",
        content: `הפעולה ${approvedAction.name} בוצעה. תוצאה: ${JSON.stringify(result)}`,
      });
    }

    for (let step = 0; step < 8; step++) {
      const data = await callGateway(conv);
      const choice = data.choices?.[0];
      const msg = choice?.message;
      const toolCalls = msg?.tool_calls ?? [];

      if (!toolCalls.length) {
        const text = (msg?.content ?? "").trim();
        return new Response(JSON.stringify({ type: "message", text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const writeCall = toolCalls.find((c: any) => WRITE_ACTIONS.has(c.function?.name));
      if (writeCall) {
        return new Response(JSON.stringify({
          type: "needs_approval",
          action: { name: writeCall.function.name, args: parseToolArgs(writeCall.function.arguments) },
          preface: (msg?.content ?? "").trim() || null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      conv.push({ role: "assistant", content: msg?.content ?? "", tool_calls: toolCalls });
      for (const call of toolCalls) {
        const args = parseToolArgs(call.function?.arguments);
        const result = await executeTool(call.function?.name, args, supabase, companyId ?? null);
        conv.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    return new Response(JSON.stringify({ type: "message", text: "הגעתי למגבלת הצעדים. נסה לפצל את הבקשה." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    const isGateway = e instanceof GatewayError;
    const status = isGateway && [400, 401, 402, 403, 404, 429].includes(e.status) ? 200 : 500;
    const error = isGateway ? gatewayErrorMessage(e) : (e?.message ?? String(e));
    return new Response(JSON.stringify({ type: "message", text: `⚠️ ${error}`, error }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
