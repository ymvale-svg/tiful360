// External API for IT systems: close a service ticket and notify the employee.
// Auth: Authorization: Bearer <api_key> (key stored hashed in public.api_keys).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enqueueTransactionalEmail } from "../_shared/enqueueEmail.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) =>
  (s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "missing api key" }, 401);
    const key = auth.slice(7).trim();
    if (!key) return json({ error: "missing api key" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const hash = await sha256(key);
    const { data: apiKey } = await admin
      .from("api_keys")
      .select("id, company_id, is_active")
      .eq("key_hash", hash)
      .eq("is_active", true)
      .maybeSingle();
    if (!apiKey) return json({ error: "invalid api key" }, 401);
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const ticket_code = typeof body.ticket_code === "string" ? body.ticket_code.trim() : "";
    const message = String(body.message ?? "").trim().slice(0, 4000);

    if (action !== "close_ticket") return json({ error: "unknown action", supported: ["close_ticket"] }, 400);
    if (!ticket_code) return json({ error: "ticket_code required" }, 400);

    const { data: t } = await admin
      .from("it_tickets")
      .select("id, ticket_code, title, status, replies, employees(full_name, email)")
      .eq("ticket_code", ticket_code)
      .eq("company_id", apiKey.company_id)
      .maybeSingle();
    if (!t) return json({ error: "ticket not found" }, 404);
    if (t.status === "done") return json({ ok: true, already_closed: true, ticket_code: t.ticket_code });

    const now = new Date().toISOString();
    const emp: any = (t as any).employees;
    const to = emp?.email && /^\S+@\S+\.\S+$/.test(emp.email) ? emp.email : null;

    const entry = {
      id: crypto.randomUUID(),
      kind: "done",
      message,
      author: "מערכת IT חיצונית",
      author_id: null,
      created_at: now,
      emailed: false,
    };

    if (to) {
      const html = `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="font-family:Arial,sans-serif;background:#ffffff;direction:rtl;text-align:right;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 8px;">הקריאה שלך טופלה</h2>
        <p>שלום ${esc(emp?.full_name ?? "")},</p>
        <p style="color:#475569;">קריאה ${esc(t.ticket_code)} — ${esc(t.title)}</p>
        ${message ? `<p style="background:#f1f5f9;border-radius:8px;padding:12px;">${esc(message)}</p>` : ""}
        <p style="color:#94a3b8;font-size:12px;">נשלח אוטומטית ממערכת Tiful360</p>
      </body></html>`;
      const sent = await enqueueTransactionalEmail(admin, {
        to,
        subject: `הקריאה שלך טופלה — ${t.ticket_code}`,
        html,
        label: "service-ticket-done-api",
        companyId: apiKey.company_id,
        idempotencyKey: `ticket-api-done-${entry.id}`,
      });
      entry.emailed = !!sent;
    }

    const replies = Array.isArray(t.replies) ? [...t.replies, entry] : [entry];
    const { error } = await admin
      .from("it_tickets")
      .update({ status: "done", replies, updated_at: now })
      .eq("id", t.id);
    if (error) return json({ error: "update failed", details: error.message }, 500);

    return json({ ok: true, ticket_code: t.ticket_code, status: "done", emailed: entry.emailed });
  } catch (e) {
    return json({ error: "server error", details: String(e) }, 500);
  }
});
