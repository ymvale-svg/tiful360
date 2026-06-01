// AI Assistant Edge Function — calls Lovable AI Gateway with function calling
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

// ---------- Tool declarations (OpenAI-compatible) ----------
const tools = [
  {
    type: "function",
    function: {
      name: "search_employees",
      description: "חיפוש עובדים לפי שם/מחלקה/סטטוס בחברה הנוכחית",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "טקסט חיפוש בשם או אימייל" },
          department: { type: "string" },
          status: { type: "string", description: "active / inactive / terminated" },
          limit: { type: "integer", description: "ברירת מחדל 20" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_assets",
      description: "חיפוש נכסים/ציוד",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "שם נכס/מספר סידורי" },
          status: { type: "string" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expiring_assets",
      description: "נכסים שתוקפם פג בקרוב (לפי expiry_date)",
      parameters: {
        type: "object",
        properties: { days_ahead: { type: "integer", description: "ברירת מחדל 30" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pending_leave_requests",
      description: "בקשות חופשה ממתינות לאישור",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_it_tickets",
      description: "פניות IT לפי סטטוס/קדימות",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "open / in_progress / resolved / closed" },
          priority: { type: "string" },
          limit: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_employee",
      description: "יצירת עובד חדש. דורש אישור משתמש לפני קריאה.",
      parameters: {
        type: "object",
        properties: {
          full_name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          department: { type: "string" },
          role: { type: "string" },
        },
        required: ["full_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_it_ticket",
      description: "פתיחת פניית IT חדשה",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          ticket_type: { type: "string", description: "incident / request / question" },
          priority: { type: "string", description: "low / medium / high / urgent" },
          employee_id: { type: "string", description: "uuid של מבקש הפנייה" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_leave_request",
      description: "אישור או דחיית בקשת חופשה",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          decision: { type: "string", description: "approved / rejected" },
          manager_note: { type: "string" },
        },
        required: ["request_id", "decision"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_it_ticket",
      description: "סגירת פניית IT",
      parameters: {
        type: "object",
        properties: {
          ticket_id: { type: "string" },
          resolution_note: { type: "string" },
        },
        required: ["ticket_id"],
      },
    },
  },
];

const WRITE_ACTIONS = new Set([
  "create_employee", "create_it_ticket", "approve_leave_request", "close_it_ticket",
]);

const SYSTEM_PROMPT = `אתה "תפעול AI" — עוזר חכם במערכת ניהול משאבי אנוש ונכסים.
- ענה בעברית, קצר ולעניין.
- השתמש בכלים כדי לאתר מידע מהמערכת במקום לנחש.
- כשאתה מציג נתונים, השתמש ב-Markdown ותציג טבלאות/רשימות כשמתאים.
- אל תמציא נתונים. אם חסר מידע — שאל את המשתמש.
- פעולות כתיבה (יצירה/עדכון) רגישות — תאר מה אתה עומד לעשות וחכה לאישור המשתמש לפני שתבצע.`;

async function executeTool(name: string, args: any, supabase: any, companyId: string | null) {
  const lim = Math.min(args?.limit ?? 20, 50);
  try {
    switch (name) {
      case "search_employees": {
        let q = supabase.from("employees").select("id,full_name,email,phone,department,role,status").limit(lim);
        if (companyId) q = q.eq("company_id", companyId);
        if (args?.query) q = q.or(`full_name.ilike.%${args.query}%,email.ilike.%${args.query}%`);
        if (args?.department) q = q.eq("department", args.department);
        if (args?.status) q = q.eq("status", args.status);
        const { data, error } = await q;
        return error ? { error: error.message } : { count: data?.length, results: data };
      }
      case "search_assets": {
        let q = supabase.from("assets").select("id,asset_code,asset_name,serial_number,status,expiry_date,current_owner_id").limit(lim);
        if (companyId) q = q.eq("company_id", companyId);
        if (args?.query) q = q.or(`asset_name.ilike.%${args.query}%,serial_number.ilike.%${args.query}%,asset_code.ilike.%${args.query}%`);
        if (args?.status) q = q.eq("status", args.status);
        const { data, error } = await q;
        return error ? { error: error.message } : { count: data?.length, results: data };
      }
      case "get_expiring_assets": {
        const days = args?.days_ahead ?? 30;
        const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        let q = supabase.from("assets").select("id,asset_code,asset_name,expiry_date,current_owner_id")
          .not("expiry_date", "is", null).lte("expiry_date", cutoff).order("expiry_date").limit(50);
        if (companyId) q = q.eq("company_id", companyId);
        const { data, error } = await q;
        return error ? { error: error.message } : { count: data?.length, results: data };
      }
      case "get_pending_leave_requests": {
        let q = supabase.from("leave_requests").select("id,employee_id,request_type,start_date,end_date,total_days,reason,status").eq("status", "pending").order("created_at", { ascending: false }).limit(50);
        if (companyId) q = q.eq("company_id", companyId);
        const { data, error } = await q;
        return error ? { error: error.message } : { count: data?.length, results: data };
      }
      case "get_it_tickets": {
        let q = supabase.from("it_tickets").select("id,ticket_code,title,ticket_type,priority,status,employee_id,assigned_to,created_at").order("created_at", { ascending: false }).limit(lim);
        if (companyId) q = q.eq("company_id", companyId);
        if (args?.status) q = q.eq("status", args.status);
        if (args?.priority) q = q.eq("priority", args.priority);
        const { data, error } = await q;
        return error ? { error: error.message } : { count: data?.length, results: data };
      }
      case "create_employee": {
        if (!companyId) return { error: "לא נבחרה חברה" };
        const { data, error } = await supabase.from("employees").insert({
          company_id: companyId,
          full_name: args.full_name,
          email: args.email ?? null,
          phone: args.phone ?? null,
          department: args.department ?? null,
          role: args.role ?? null,
          status: "active",
        }).select("id,full_name,email").single();
        return error ? { error: error.message } : { success: true, employee: data };
      }
      case "create_it_ticket": {
        if (!companyId) return { error: "לא נבחרה חברה" };
        const { data, error } = await supabase.from("it_tickets").insert({
          company_id: companyId,
          title: args.title,
          ticket_type: args.ticket_type ?? "request",
          priority: args.priority ?? "medium",
          status: "open",
          employee_id: args.employee_id ?? null,
        }).select("id,ticket_code,title").single();
        return error ? { error: error.message } : { success: true, ticket: data };
      }
      case "approve_leave_request": {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("leave_requests").update({
          status: args.decision,
          manager_note: args.manager_note ?? null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        }).eq("id", args.request_id).select("id,status").single();
        return error ? { error: error.message } : { success: true, request: data };
      }
      case "close_it_ticket": {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("it_tickets").update({
          status: "closed",
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id ?? null,
        }).eq("id", args.ticket_id).select("id,ticket_code,status").single();
        return error ? { error: error.message } : { success: true, ticket: data };
      }
      default:
        return { error: `כלי לא ידוע: ${name}` };
    }
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

function parseToolArgs(rawArgs: unknown) {
  if (!rawArgs) return {};
  if (typeof rawArgs === "object") return rawArgs;
  try {
    return JSON.parse(String(rawArgs));
  } catch {
    return {};
  }
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
  try { payload = JSON.parse(text); } catch { /* keep text */ }
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
        content: `הפעולה ${approvedAction.name} בוצעה. תוצאת הפעולה: ${JSON.stringify(result)}`,
      });
    }

    // Agentic loop — up to 5 tool rounds
    for (let step = 0; step < 5; step++) {
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

      conv.push({
        role: "assistant",
        content: msg?.content ?? "",
        tool_calls: toolCalls,
      });
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
