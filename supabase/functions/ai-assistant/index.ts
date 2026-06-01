// AI Assistant Edge Function — calls Lovable AI Gateway with function calling
// Uses user's JWT to query Supabase with RLS enforcing role-based access.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const MODEL = Deno.env.get("AI_MODEL") ?? "google/gemini-3-flash-preview";
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ---------- Tool declarations (for Gemini function calling) ----------
const tools = [{
  functionDeclarations: [
    {
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
    {
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
    {
      name: "get_expiring_assets",
      description: "נכסים שתוקפם פג בקרוב (לפי expiry_date)",
      parameters: {
        type: "object",
        properties: { days_ahead: { type: "integer", description: "ברירת מחדל 30" } },
      },
    },
    {
      name: "get_pending_leave_requests",
      description: "בקשות חופשה ממתינות לאישור",
      parameters: { type: "object", properties: {} },
    },
    {
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
    {
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
    {
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
    {
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
    {
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
  ],
}];

// Actions that require user confirmation
const WRITE_ACTIONS = new Set([
  "create_employee", "create_it_ticket", "approve_leave_request", "close_it_ticket",
]);

const SYSTEM_PROMPT = `אתה "תפעול AI" — עוזר חכם במערכת ניהול משאבי אנוש ונכסים.
- ענה בעברית, קצר ולעניין.
- השתמש בכלים כדי לאתר מידע מהמערכת במקום לנחש.
- כשאתה מציג נתונים, השתמש ב-Markdown ותציג טבלאות/רשימות כשמתאים.
- אל תמציא נתונים. אם חסר מידע — שאל את המשתמש.
- פעולות כתיבה (יצירה/עדכון) רגישות — תאר מה אתה עומד לעשות וחכה לאישור המשתמש לפני שתבצע.`;

const aiTools = tools[0].functionDeclarations.map((declaration) => ({
  type: "function",
  function: {
    name: declaration.name,
    description: declaration.description,
    parameters: declaration.parameters,
  },
}));

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

async function callAiGateway(messages: any[]) {
  const res = await fetch(AI_GATEWAY_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools: aiTools,
      tool_choice: "auto",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      return { choices: [{ message: { content: "שירות ה-AI מוגבל כרגע. נסה שוב בעוד דקה.", tool_calls: [] } }] };
    }
    if (res.status === 402) {
      return { choices: [{ message: { content: "קרדיטי ה-AI נגמרו. יש להוסיף קרדיטים בהגדרות השימוש של Lovable כדי להמשיך.", tool_calls: [] } }] };
    }
    throw new Error(`AI Gateway ${res.status}: ${text}`);
  }
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY חסר" }),
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

    // Convert chat history to Gemini "contents" shape
    const contents: any[] = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    // If this turn is an approved action — execute first and feed result back as a synthetic tool turn.
    if (approvedAction) {
      const result = await executeTool(approvedAction.name, approvedAction.args, supabase, companyId ?? null);
      // Append assistant's previous functionCall + functionResponse so model can summarize
      contents.push({ role: "model", parts: [{ functionCall: { name: approvedAction.name, args: approvedAction.args } }] });
      contents.push({ role: "user", parts: [{ functionResponse: { name: approvedAction.name, response: result } }] });
    }

    // Agentic loop — up to 5 tool rounds
    for (let step = 0; step < 5; step++) {
      const data = await callGemini(contents);
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length === 0) {
        const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join("\n").trim();
        return new Response(JSON.stringify({ type: "message", text }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check for write actions that need confirmation
      const writeCall = functionCalls.find((p: any) => WRITE_ACTIONS.has(p.functionCall.name));
      if (writeCall) {
        return new Response(JSON.stringify({
          type: "needs_approval",
          action: { name: writeCall.functionCall.name, args: writeCall.functionCall.args ?? {} },
          preface: parts.filter((p: any) => p.text).map((p: any) => p.text).join("\n").trim() || null,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Auto-execute read-only tools
      contents.push({ role: "model", parts });
      const responses = [];
      for (const fc of functionCalls) {
        const result = await executeTool(fc.functionCall.name, fc.functionCall.args ?? {}, supabase, companyId ?? null);
        responses.push({ functionResponse: { name: fc.functionCall.name, response: result } });
      }
      contents.push({ role: "user", parts: responses });
    }

    return new Response(JSON.stringify({ type: "message", text: "הגעתי למגבלת הצעדים. נסה לפצל את הבקשה." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
