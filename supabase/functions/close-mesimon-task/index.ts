// A ticket that was sent to Mesimon was closed here (by operations staff, by the IT
// person, or by onboarding/offboarding) — close the Mesimon task made from it.
// Called only by the it_tickets trigger (pg_net), with the service role key.
// Mesimon does not send the close back, so there is no loop. Secrets: MESIMON_URL,
// MESIMON_API_KEY, MESIMON_COMPANY_IDS (same as create-mesimon-task).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { mesimonCloseRequest } from "../_shared/mesimon-close.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // verify_jwt is off: only the trigger, which holds the service role key, may call it
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const body = await req.json().catch(() => ({}));
  const ticket_id = typeof body.ticket_id === "string" ? body.ticket_id : "";
  if (!ticket_id) return json({ error: "ticket_id required" }, 400);

  const { data: t } = await admin
    .from("it_tickets")
    .select("id, status, ticket_code, company_id, mesimon_task_id")
    .eq("id", ticket_id)
    .maybeSingle();
  if (!t) return json({ error: "not found" }, 404);

  const closedById = typeof body.closed_by === "string" ? body.closed_by : null;
  const { data: prof } = closedById
    ? await admin.from("profiles").select("display_name").eq("id", closedById).maybeSingle()
    : { data: null };
  const companies = (Deno.env.get("MESIMON_COMPANY_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const plan = mesimonCloseRequest(t, companies, prof?.display_name ?? "");
  if ("skip" in plan) return json({ ok: true, skipped: plan.skip });

  const base = (Deno.env.get("MESIMON_URL") ?? "").trim().replace(/\/api(\/.*)?$/, "").replace(/\/+$/, "");
  const key = (Deno.env.get("MESIMON_API_KEY") ?? "").trim();
  if (!base || !key) return json({ ok: true, skipped: "Mesimon is not configured" });

  const log = (details: string) =>
    admin.from("activity_log").insert({
      company_id: t.company_id,
      performed_by: closedById,
      action: "סגירת משימה במשימון",
      entity_type: "it_tickets",
      entity_id: t.id,
      details,
    });

  try {
    const res = await fetch(`${base}/api/integrations/tiful360/tasks/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(plan.body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
    if (!data.alreadyClosed) await log(`הקריאה ${t.ticket_code} נסגרה — גם המשימה ${t.mesimon_task_id} במשימון נסגרה`);
    return json({ ok: true, already_closed: !!data.alreadyClosed });
  } catch (e) {
    const msg = (e as Error).message;
    console.error("close-mesimon-task", t.ticket_code, msg);
    await log(`סגירת המשימה ${t.mesimon_task_id} במשימון נכשלה: ${msg}`);
    return json({ error: msg }, 502);
  }
});
