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
    writable: [
      "full_name", "email", "phone", "department", "role", "id_number", "employee_code",
      "start_date", "end_date", "status", "direct_manager_id", "sub_employer_id",
      "birth_date", "gender", "city", "street", "house_number", "marital_status",
      "is_israeli_resident", "health_fund_member", "vacation_balance", "sick_balance",
      "tracks_attendance", "attendance_notifications_disabled", "can_remote_punch",
      "exclude_from_contacts", "work_days",
    ],
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
    writable: [
      "asset_code", "asset_name", "category_id", "group_id",
      "serial_number", "manufacturer_model", "current_owner_id",
      "status", "condition", "expiry_date", "notification_days_before", "notes",
      "license_plate", "vehicle_type", "fuel_type", "year_of_manufacture", "current_km",
      "test_expiry", "insurance_expiry", "license_expiry",
      "insurance_company", "insurance_policy_number",
      "account_username", "account_url", "mfa_enabled",
      "password_expires_at", "license_expires_at",
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
  {
    table: "asset_documents",
    desc: "מסמכים מצורפים לנכסים (חוזים, פוליסות, אישורים, תעודות וכו')",
    requireCompany: true,
    columns: [
      { name: "id", type: "uuid", desc: "מזהה המסמך" },
      { name: "asset_id", type: "uuid", desc: "FK ל-assets.id" },
      { name: "document_type", type: "text", desc: "סוג מסמך (contract/policy/certificate/other וכו')" },
      { name: "document_label", type: "text", desc: "תווית/שם תיאורי של המסמך" },
      { name: "file_name", type: "text", desc: "שם הקובץ המקורי" },
      { name: "file_size_bytes", type: "number", desc: "גודל בבייטים" },
      { name: "expiry_date", type: "date", desc: "תאריך תפוגה של המסמך" },
      { name: "notes", type: "text", desc: "הערות" },
      { name: "uploaded_at", type: "timestamptz", desc: "מתי הועלה" },
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
  {
    type: "function",
    function: {
      name: "get_document_url",
      description:
        "מייצר קישור חתום זמני (10 דקות) להורדה/צפייה במסמך מתוך asset_documents לפי id. השתמש בו אחרי שמצאת מסמך עם query_table על asset_documents.",
      parameters: {
        type: "object",
        required: ["document_id"],
        properties: {
          document_id: { type: "string", description: "id של השורה ב-asset_documents" },
        },
      },
    },
  },
];

const WRITE_ACTIONS = new Set(["insert_row", "update_row"]);


// ============================================================
// Company catalog cache — injected into system prompt so the agent
// already knows the real categories/groups for this company.
// ============================================================
type CatalogEntry = { value: string; expiresAt: number };
const catalogCache = new Map<string, CatalogEntry>();
const CATALOG_TTL_MS = 60_000;

async function loadCompanyCatalog(supabase: any, companyId: string | null): Promise<string> {
  if (!companyId) return "## קטלוג החברה\n(לא זמין — אין companyId)";
  const cached = catalogCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [catsRes, groupsRes, deptRes, roleRes] = await Promise.all([
    supabase.from("asset_categories")
      .select("id, category_name, domain, is_assignable")
      .eq("company_id", companyId)
      .order("domain")
      .order("category_name"),
    supabase.from("asset_groups")
      .select("id, name, category_id")
      .eq("company_id", companyId)
      .order("name"),
    supabase.from("employees")
      .select("department")
      .eq("company_id", companyId)
      .not("department", "is", null)
      .limit(500),
    supabase.from("employees")
      .select("role")
      .eq("company_id", companyId)
      .not("role", "is", null)
      .limit(500),
  ]);

  const cats = catsRes.data ?? [];
  const groups = groupsRes.data ?? [];
  const departments = Array.from(new Set((deptRes.data ?? []).map((r: any) => r.department).filter(Boolean))).slice(0, 50);
  const roles = Array.from(new Set((roleRes.data ?? []).map((r: any) => r.role).filter(Boolean))).slice(0, 50);

  const groupsByCat = new Map<string, any[]>();
  for (const g of groups) {
    const arr = groupsByCat.get(g.category_id) ?? [];
    arr.push(g);
    groupsByCat.set(g.category_id, arr);
  }

  const catLines = cats.length
    ? cats.map((c: any) => {
        const gs = groupsByCat.get(c.id) ?? [];
        const groupStr = gs.length ? ` | קבוצות: ${gs.map((g: any) => `"${g.name}" (${g.id})`).join(", ")}` : "";
        const assignable = c.is_assignable ? "" : " [לא ניתן להקצאה]";
        return `- domain=${c.domain} | "${c.category_name}" → id=${c.id}${assignable}${groupStr}`;
      }).join("\n")
    : "(אין קטגוריות מוגדרות לחברה)";

  const value = `## קטלוג החברה (חי — השתמש בו במקום לנחש)
### asset_categories
${catLines}

### מחלקות employees.department קיימות
${departments.length ? departments.map((d) => `- ${d}`).join("\n") : "(אין נתונים)"}

### תפקידים employees.role קיימים
${roles.length ? roles.map((r) => `- ${r}`).join("\n") : "(אין נתונים)"}`;

  catalogCache.set(companyId, { value, expiresAt: Date.now() + CATALOG_TTL_MS });
  return value;
}

function baseSystemPrompt(catalog: string): string {
  return `אתה "תפעול AI" — עוזר חכם במערכת ניהול משאבי אנוש ונכסים.

## הנחיות תקשורת
- ענה בעברית, קצר ולעניין.
- השתמש ב-Markdown (טבלאות/רשימות) להצגת נתונים.
- היום הוא ${new Date().toISOString().slice(0, 10)}.
- **פורמט תאריכים בתשובה: תמיד DD/MM/YYYY** (לדוגמה 30/09/2026). גם אם הערך מהמסד הוא YYYY-MM-DD — המר אותו ל-DD/MM/YYYY לפני ההצגה. אל תשתמש במקפים או בפורמט אחר.

## כלל קריטי — אפס המצאות
- כל ערך שאתה מציג חייב להגיע *ישירות* מתוצאת query_table באותה שיחה. שמות, מספרים, תאריכים — הכל מהכלי בלבד.
- אם הכלי החזיר ריק — אמור "לא מצאתי" והסבר מה ניסית. אסור לנחש או למלא בערכים סבירים.
- מספר השורות בתשובה = בדיוק מספר השורות מהכלי.
- **איסור מוחלט על "רשימות הצעות/דוגמאות"**: אם הכלי החזיר 0 שורות, אסור בתכלית האיסור להציג רשימה של שמות אפשריים, פוליסות לדוגמה, חברות, ערים, או כל ערך אחר שלא הוחזר מהכלי. אל תוסיף "המסמכים שהיו בחיפוש הקודם" או "שמות שאולי תכוונת אליהם" אלא אם הם הופיעו *בתוצאה אמיתית של query_table באותה שיחה*. ידע כללי מהאימון של המודל (שמות חברות בישראל, ערים, מותגים) — **אסור** להופיע בתשובה.
- אם אתה מרגיש שאתה כותב רשימה של שמות בלי שהרצת query_table שמחזיר אותם — עצור ומחק. במקום זה כתוב: "לא נמצאו תוצאות עבור X. ניסיתי: <השאילתות>."

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
- "ביטוח שפג" → assets עם \`expiry_date lt היום\` (או \`insurance_expiry lt היום\` אם השדה הזה מאוכלס).
- "ביטוחים של עיר/מקום/סניף X" או "באיזה מקומות יש ביטוח" → assets עם \`category_id in [<id-ים עם domain=insurance>]\`. השם/מיקום/סוג הביטוח נמצא ב-\`asset_name\` (לא ב-\`insurance_company\` — שם זה רק שם חברת הביטוח כמו "הראל"/"מנורה"). לחיפוש לפי מקום או סוג: \`asset_name ilike '%X%'\`.
- **קריטי — סוגי ביטוח**: הקטגוריה היחידה היא "ביטוחים" (domain=insurance). מילים כמו **"מבנה"**, "רכב", "דירה", "עסק", "צד ג", "עבודות קבלניות", "אחריות מקצועית" וכו' הן **תתי-סוגים בתוך \`asset_name\`** — לא קטגוריות נפרדות. **לעולם אל תחפש קטגוריה בשם "ביטוח מבנה"** — היא לא קיימת. תמיד: \`category_id in [<insurance ids>]\` + \`asset_name ilike '%<סוג>%'\`.
- "אילו נכסים יש להם ביטוח <סוג>?" (למשל "ביטוח מבנה", "ביטוח רכב") → query_table assets, filter: \`category_id in [<insurance ids>]\` + \`asset_name ilike '%<סוג>%'\`. דוגמה: "ביטוח מבנה" → \`asset_name ilike '%מבנה%'\`.
- "ביטוח <סוג> בתוקף" (למשל "עבודות קבלניות בתוקף", "צד ג בתוקף") → assets domain=insurance + \`asset_name ilike '%<סוג>%'\` + \`expiry_date gte היום\`. **אל תסתמך על \`status\`** — תוקף ביטוח נקבע ע"י \`expiry_date\` (השדה הראשי לתפוגה בכל הנכסים), לא ע"י עמודת status.
- **כלל כללי**: כשמחפשים נכס לפי "שם"/"מקום"/"תיאור"/"סוג" — תמיד \`asset_name ilike\` (זה השדה החופשי). שדות כמו \`insurance_company\`, \`manufacturer_model\`, \`license_plate\` הם נתוני-עזר ספציפיים, לא שם הנכס. אם עמודה ספציפית ריקה — נסה את \`asset_name\` לפני שאתה אומר "לא נמצא".
- **"בתוקף" / "פג" לכל נכס** — תמיד \`expiry_date\` (gte/lt היום). אל תשתמש ב-\`status\` לבדיקת תוקף.
- **לפני שאתה אומר "לא נמצא"**: ודא שהרצת \`asset_name ilike '%<מילת מפתח>%'\` (רק המילה החשובה, בלי "ביטוח" בתחילה). אם "ביטוח מבנה" לא מצא — נסה רק \`%מבנה%\`.
- **חוק ברזל — תמיד חפש גם ב-\`asset_name\`**: בכל שאילתה שמזכירה מילת מפתח כלשהי (שם עיר, מקום, סניף, אדם, חברה, סוג, תיאור, מספר, או כל מחרוזת חופשית) — **חובה** לכלול \`asset_name ilike '%<מילה>%'\` בנוסף או במקום חיפוש בעמודות הספציפיות (\`insurance_company\`, \`license_plate\`, \`manufacturer_model\`, \`serial_number\` וכו'). הסיבה: ברוב המקרים המידע (כולל עיר, מיקום, סוג) מקודד בתוך שם הנכס. דוגמה: "ביטוחים בנשר" → \`asset_name ilike '%נשר%'\`. **לעולם אל תאמר "לא נמצא" לפני שהרצת ilike רחב על \`asset_name\` עם המילה.**

## חוק ברזל — מילים נרדפות, יחיד/רבים, זכר/נקבה
- **לכל מילת מפתח בשאילתה — חובה להריץ ilike על כל הצורות והנרדפים, לא רק על המילה המקורית.** הרץ שאילתות מקבילות (אחת לכל וריאציה) ואחד את התוצאות לפני התשובה.
- **השתמש בשורש המינימלי**: ilike עם שורש קצר תופס יחיד+רבים+הטיות בבת אחת. למשל \`%פוליס%\` תופס "פוליסה/פוליסות/פוליסת". \`%ביטוח%\` תופס "ביטוח/ביטוחים/ביטוחי". \`%רכב%\` תופס "רכב/רכבים/רכבו".
- **מילון נרדפים חובה (הרץ ilike נפרד לכל אחד מהם בכל שאילתה רלוונטית):**
  - "פוליסה" / "פוליסות" → \`%פוליס%\` **וגם** \`%ביטוח%\` **וגם** \`%אישור ביטוח%\`.
  - "ביטוח" / "ביטוחים" → \`%ביטוח%\` **וגם** \`%פוליס%\`.
  - "אוטו" / "אוטומובילים" → \`%אוטו%\` **וגם** \`%רכב%\` **וגם** \`%רכבים%\`.
  - "רכב" → \`%רכב%\` **וגם** \`%אוטו%\`.
  - "טלפון" / "פלאפון" / "סלולרי" / "נייד" → כל הארבעה.
  - "מחשב" / "לפטופ" / "נייד" / "PC" / "מק" → כל הצורות.
  - "חוזה" / "הסכם" → שניהם.
  - "תעודה" / "אישור" / "רישיון" / "רישוי" → כולם.
  - "עובד" / "עובדת" / "עובדים" / "עובדות" → \`%עוב%\` (שורש מקצר תופס הכל).
  - "מנהל" / "מנהלת" → \`%מנהל%\`.
  - "דירה" / "דירות" / "מבנה" / "משרד" / "סניף" → לפי הקשר; כשמדובר בנדל"ן הרץ ilike על כולם.
- **כלל יחיד/רבים זכר/נקבה לכל מילה אחרת**: אם המשתמש כתב מילה בעברית — חתוך את הסיומות (ה/ות/ים/ת/י) לפני ilike, או הרץ ilike עם שורש קצר של 3-4 אותיות. דוגמה: "מסמכים" → \`%מסמ%\`, "רישיונות" → \`%רישי%\`.
- אם הריצה הראשונה החזירה 0 — **חובה** לנסות שוב עם נרדף או שורש מקוצר לפני שאתה אומר "לא נמצא".

## מסמכים מצורפים (asset_documents) — חובה
- לכל נכס יכולים להיות מסמכים בטבלת \`asset_documents\` (חוזים, פוליסות, תעודות, אישורים). \`document_label\` יכול להיות NULL — אז השם נמצא ב-\`file_name\`.
- **כל בקשה שמכילה "קישור" / "מסמך" / "פוליסה" / "חוזה" / "תצוגה" / "פתח" / "תן לי את ה..." → חובה להריץ את הזרימה הזו עד הסוף, בלי לעצור באמצע:**
  1. \`query_table assets\` לפי שם/מילת מפתח (\`asset_name ilike '%X%'\`) — קבל \`id\`.
  2. \`query_table asset_documents\` עם \`asset_id eq <id>\` — קבל את כל המסמכים. **בחר שדות: \`id, file_name, document_label, document_type\`.**
  3. לכל מסמך שמצאת — קרא ל-\`get_document_url\` עם ה-\`document_id\` שלו וקבל \`signed_url\`.
  4. **הצג בתשובה רשימת קישורים Markdown ישירים** בפורמט: \`- [<file_name או document_label>](<signed_url>)\` — קישור אחד לכל מסמך. הוסף הערה: "הקישורים תקפים ל-10 דקות."
- **אסור** להציג שם מסמך בלי קישור. אם החזרת רק רשימת שמות בלי URL — זו תשובה שגויה. תמיד תקרא ל-\`get_document_url\` לפני שאתה משיב.
- אם \`query_table asset_documents\` החזיר 0 — אמור "אין מסמכים מצורפים לנכס זה" (ולא רשימת ניחושים).


## חיפושים כלליים
- העדף **ilike** על eq עבור טקסט בעברית.
- "מי גר ב..." → employees \`city ilike '%X%'\`.
- "המנהל של X" → קודם employees לפי שם, ואז employees נוסף לפי \`direct_manager_id\`.

## חוק ברזל — חיפוש עובד לפי שם
- כשהמשתמש נותן שם עובד (שם פרטי + משפחה, או רק אחד מהם), חפש ב-\`employees.full_name ilike\`.
- **אם השם מכיל יותר ממילה אחת** (למשל "גילעד קוגלמן") והחיפוש המלא \`full_name ilike '%גילעד קוגלמן%'\` החזיר 0 — **חובה** להריץ חיפוש נפרד לכל מילה לחוד (\`full_name ilike '%גילעד%'\` וגם \`full_name ilike '%קוגלמן%'\`) לפני שאתה אומר "לא מצאתי".
- **סדר מילים לא משנה**: "מלכה קוגלמן" ו-"קוגלמן מלכה" הם אותו עובד. אם חיפוש מלא בסדר שניתן נכשל, חובה לנסות גם את הסדר ההפוך (\`full_name ilike '%קוגלמן מלכה%'\`) **וגם** חיפוש נפרד לכל מילה. עובד שמכיל את **כל** המילים בכל סדר — הוא ההתאמה.
- אם נמצא בדיוק עובד אחד עם אחת מהמילים — זה העובד. אם נמצאו כמה — העדף את זה שמכיל את כל המילים (בכל סדר); אחרת הצג רשימה קצרה ובקש לבחור.
- אותו כלל לחיפוש לפי שם משפחה בלבד, שם פרטי בלבד, או שם עם שגיאת כתיב קלה (נסה שורש מקוצר של 3-4 אותיות).
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

function formatDateDDMMYYYY(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value);
}

function normalizeHebrewSearchTerm(term: string): string {
  let value = term
    .replace(/["'״׳.,!?;:()[\]{}<>]/g, "")
    .replace(/^(של|את|ה)/, "")
    .replace(/^[ובכלמ]/, "")
    .replace(/(ים|ות|יה|יו|ית|י|ה|ת)$/u, "")
    .trim();
  if (value.length < 3) value = term.replace(/["'״׳.,!?;:()[\]{}<>]/g, "").trim();
  return value;
}

function extractAssetSearchTerms(message: string): string[] {
  const stopWords = new Set([
    "תן", "לי", "את", "של", "על", "עם", "כל", "מה", "מי", "איפה", "איזה", "איזו", "אלו", "יש",
    "נא", "בבקשה", "פתח", "הצג", "תציג", "תראה", "קישור", "לינק", "מסמך", "מסמכים", "תצוגה",
    "ביטוח", "הביטוח", "ביטוחים", "פוליסה", "פוליסת", "פוליסות", "אישור", "אישורי", "תוקף", "בתוקף", "פג",
  ]);
  const words = message.split(/\s+/).map((word) => word.trim()).filter(Boolean);
  const terms = new Set<string>();
  for (const word of words) {
    const normalized = normalizeHebrewSearchTerm(word);
    if (normalized.length >= 3 && !stopWords.has(word) && !stopWords.has(normalized)) terms.add(normalized);
  }
  return Array.from(terms);
}

function isAssetDocumentIntent(message: string): boolean {
  return /(ביטוח|פוליס|מסמך|מסמכ|קישור|לינק|פתח|תצוג|חוזה|אישור|תעודה|רישיון|רשיון)/.test(message);
}

async function tryAnswerAssetDocumentSearch(message: string, supabase: any, companyId: string | null): Promise<string | null> {
  if (!companyId || !isAssetDocumentIntent(message)) return null;

  const isInsurance = /(ביטוח|פוליס)/.test(message);
  const searchTerms = extractAssetSearchTerms(message);
  const categoryIds: string[] = [];

  if (isInsurance) {
    const { data: categories } = await supabase
      .from("asset_categories")
      .select("id")
      .eq("company_id", companyId)
      .eq("domain", "insurance");
    categoryIds.push(...(categories ?? []).map((row: any) => row.id).filter(Boolean));
  }

  const assetMap = new Map<string, any>();
  const attempts = searchTerms.length ? searchTerms : isInsurance ? ["ביטוח", "פוליס"] : [];
  for (const term of attempts) {
    let q = supabase
      .from("assets")
      .select("id, asset_name, asset_code, category_id, expiry_date, insurance_expiry, insurance_company, insurance_policy_number")
      .eq("company_id", companyId)
      .ilike("asset_name", `%${term}%`)
      .limit(10);
    if (categoryIds.length) q = q.in("category_id", categoryIds);
    const { data, error } = await q;
    if (!error) for (const asset of data ?? []) assetMap.set(asset.id, asset);
    if (assetMap.size) break;
  }

  if (!assetMap.size && searchTerms.length) {
    for (const term of searchTerms) {
      const { data, error } = await supabase
        .from("assets")
        .select("id, asset_name, asset_code, category_id, expiry_date, insurance_expiry, insurance_company, insurance_policy_number")
        .eq("company_id", companyId)
        .ilike("asset_name", `%${term}%`)
        .limit(10);
      if (!error) for (const asset of data ?? []) assetMap.set(asset.id, asset);
      if (assetMap.size) break;
    }
  }

  const assets = Array.from(assetMap.values());
  if (!assets.length) return null;

  const assetIds = assets.map((asset: any) => asset.id);
  const { data: docs } = await supabase
    .from("asset_documents")
    .select("id, asset_id, file_url, file_name, document_label, document_type, expiry_date")
    .eq("company_id", companyId)
    .in("asset_id", assetIds)
    .order("uploaded_at", { ascending: false });

  const docsByAsset = new Map<string, any[]>();
  for (const doc of docs ?? []) {
    const list = docsByAsset.get(doc.asset_id) ?? [];
    list.push(doc);
    docsByAsset.set(doc.asset_id, list);
  }

  const lines: string[] = [assets.length === 1 ? "מצאתי את הנכס:" : "מצאתי את הנכסים:"];
  for (const asset of assets) {
    const expiry = formatDateDDMMYYYY(asset.expiry_date ?? asset.insurance_expiry);
    lines.push(`- **${asset.asset_name}**${expiry ? ` — בתוקף עד ${expiry}` : ""}`);
    const assetDocs = docsByAsset.get(asset.id) ?? [];
    if (!assetDocs.length) {
      lines.push("  - אין מסמכים מצורפים לנכס זה.");
      continue;
    }
    for (const doc of assetDocs) {
      const { data: signed } = await supabase.storage.from("asset-documents").createSignedUrl(doc.file_url, 60 * 10);
      const label = doc.document_label || doc.file_name || "צפייה במסמך";
      if (signed?.signedUrl) lines.push(`  - [${label}](${signed.signedUrl})`);
    }
  }
  if ((docs ?? []).length) lines.push("הקישורים תקפים ל-10 דקות.");
  return lines.join("\n");
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

    if (name === "get_document_url") {
      const docId = String(args?.document_id ?? "").trim();
      if (!docId) return { error: "חסר document_id" };
      let q = supabase.from("asset_documents").select("id, file_url, file_name, document_label, asset_id, company_id").eq("id", docId);
      if (companyId) q = q.eq("company_id", companyId);
      const { data: doc, error: docErr } = await q.maybeSingle();
      if (docErr) return { error: docErr.message };
      if (!doc) return { error: "מסמך לא נמצא או לא משויך לחברה" };
      const { data: signed, error: signErr } = await supabase.storage
        .from("asset-documents")
        .createSignedUrl(doc.file_url, 60 * 10);
      if (signErr) return { error: signErr.message };
      return {
        document_id: doc.id,
        file_name: doc.file_name,
        document_label: doc.document_label,
        signed_url: signed?.signedUrl,
        expires_in_seconds: 600,
      };
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

    const latestUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    if (!approvedAction && latestUserMessage) {
      const directAssetAnswer = await tryAnswerAssetDocumentSearch(latestUserMessage, supabase, companyId ?? null);
      if (directAssetAnswer) {
        return new Response(JSON.stringify({ type: "message", text: directAssetAnswer }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const conv: any[] = [
      { role: "system", content: baseSystemPrompt(await loadCompanyCatalog(supabase, companyId ?? null)) },
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
