// Sends a reply (or a "ticket handled" notice) to the employee who opened the ticket,
// and stores it in it_tickets.replies.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enqueueTransactionalEmail } from "../_shared/enqueueEmail.ts";

const APP_BASE = "https://tiful360.com";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const esc = (s: string) =>
  (s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: claims } = await authClient.auth.getClaims(auth.replace("Bearer ", ""));
    const uid = claims?.claims?.sub;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const ticket_id = typeof body.ticket_id === "string" ? body.ticket_id : "";
    const kind = body.kind === "done" ? "done" : "reply";
    const message = String(body.message ?? "").trim().slice(0, 4000);
    if (!ticket_id) return json({ error: "ticket_id required" }, 400);
    if (kind === "reply" && !message) return json({ error: "message required" }, 400);

    const { data: visible } = await authClient.from("it_tickets").select("id").eq("id", ticket_id).maybeSingle();
    if (!visible) return json({ error: "Forbidden" }, 403);
    const [{ data: ops }, { data: sa }, { data: hr }] = await Promise.all([
      authClient.rpc("is_ops_staff", { _user_id: uid }),
      authClient.rpc("is_super_admin", { _user_id: uid }),
      authClient.rpc("is_hr", { _user_id: uid }),
    ]);
    if (!ops && !sa && !hr) return json({ error: "Forbidden" }, 403);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: t } = await admin
      .from("it_tickets")
      .select("id, company_id, ticket_code, title, replies, employees(full_name, email)")
      .eq("id", ticket_id)
      .single();
    if (!t) return json({ error: "not found" }, 404);
    const { data: prof } = await admin.from("profiles").select("full_name").eq("id", uid).maybeSingle();
    const author = prof?.full_name ?? "צוות התפעול";
    const emp: any = (t as any).employees;
    const to = emp?.email && /^\S+@\S+\.\S+$/.test(emp.email) ? emp.email : null;

    const now = new Date().toISOString();
    const entry = { id: crypto.randomUUID(), kind, message, author, author_id: uid, created_at: now, emailed: false };

    if (to) {
      const heading = kind === "done" ? "הקריאה שלך טופלה" : "התקבלה תגובה לקריאה שלך";
      const html = `<!doctype html><html lang="he" dir="rtl"><body dir="rtl" style="font-family:Arial,sans-serif;background:#ffffff;direction:rtl;text-align:right;padding:24px;color:#1a1a1a;">
        <h2 style="margin:0 0 8px;">${heading}</h2>
        <p>שלום ${esc(emp?.full_name ?? "")},</p>
        <p style="color:#475569;">קריאה ${esc(t.ticket_code)} — ${esc(t.title)}</p>
        ${message ? `<div style="background:#f1f5f9;border-radius:8px;padding:12px;margin:12px 0;">${esc(message).replaceAll("\n", "<br>")}</div>` : ""}
        <p style="color:#64748b;font-size:13px;">נשלח על ידי: ${esc(author)}</p>
        <p><a href="${APP_BASE}/portal" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;">לאזור האישי</a></p>
      </body></html>`;
      entry.emailed = await enqueueTransactionalEmail(admin, {
        to,
        subject: `${heading} — ${t.ticket_code}`,
        html,
        label: kind === "done" ? "service-ticket-done" : "service-ticket-reply",
        idempotencyKey: `ticket-${kind}-${entry.id}`,
        metadata: { ticket_id },
        companyId: t.company_id,
      });
    }

    if (kind === "reply" || message) {
      const replies = Array.isArray(t.replies) ? t.replies : [];
      await admin.from("it_tickets").update({ replies: [...replies, entry] }).eq("id", ticket_id);
    }
    return json({ ok: true, emailed: entry.emailed, has_email: !!to });
  } catch (e) {
    console.error("reply-it-ticket", e);
    return json({ error: (e as Error).message }, 500);
  }
});
