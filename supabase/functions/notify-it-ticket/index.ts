// Edge Function: notify-it-ticket
// Sends an email notification to the configured IT recipients (companies.it_emails)
// when a new IT ticket is opened.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.bedekclic.com";
const FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const FROM_NAME = "תפעול 360";

const PRIORITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "רגיל",
  low: "נמוך",
};

const TYPE_LABELS: Record<string, string> = {
  hardware: "תמיכה טכנית",
  software: "תוכנה / רישיונות",
  access: "הרשאות וגישה",
  offboarding: "ניתוקים / סיום העסקה",
};

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(
    title,
  )}</title></head><body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <tr><td style="background:#0f172a;color:#fff;padding:18px 24px;font-size:16px;font-weight:bold;">תפעול 360 — קריאת IT חדשה</td></tr>
        <tr><td style="padding:24px;">${body}</td></tr>
        <tr><td style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">הודעה אוטומטית ממערכת תפעול 360</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailsTable(rows: Array<[string, string]>) {
  return `<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:12px 0;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#64748b;padding:4px 12px 4px 0;">${escapeHtml(
            k,
          )}</td><td style="font-weight:600;">${escapeHtml(v)}</td></tr>`,
      )
      .join("")}
  </table>`;
}

async function enqueueEmail(
  supabase: any,
  to: string,
  subject: string,
  html: string,
) {
  const payload = {
    to,
    from: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    html,
    template_name: "it_ticket_new",
  };
  const { error } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload,
  });
  if (error) console.error("enqueue error", to, error);
  return !error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: ticket, error: ticketErr } = await supabase
      .from("it_tickets")
      .select("*, employees(full_name, phone, email, department)")
      .eq("id", ticket_id)
      .single();

    if (ticketErr || !ticket) {
      return new Response(JSON.stringify({ error: "ticket not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, it_emails")
      .eq("id", ticket.company_id)
      .single();

    const recipients = (company?.it_emails ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s));

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, warning: "no IT recipients configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const employee = (ticket as any).employees;
    const checklist = Array.isArray(ticket.checklist) ? ticket.checklist : [];
    const description =
      checklist.find((c: any) => c.type === "description")?.label ?? "";
    const location = checklist
      .find((c: any) => typeof c.label === "string" && c.label.startsWith("מיקום:"))
      ?.label?.replace("מיקום: ", "") ?? "";
    const phone = checklist
      .find((c: any) => typeof c.label === "string" && c.label.startsWith("טלפון איש קשר:"))
      ?.label?.replace("טלפון איש קשר: ", "") ?? employee?.phone ?? "";

    const portalBase =
      req.headers.get("origin") ?? "https://tiful360.lovable.app";
    const ticketUrl = `${portalBase}/it-tickets`;

    const rows: Array<[string, string]> = [
      ["מספר קריאה", ticket.ticket_code],
      ["נושא", ticket.title],
      ["סוג", TYPE_LABELS[ticket.ticket_type] ?? ticket.ticket_type],
      ["דחיפות", PRIORITY_LABELS[ticket.priority] ?? ticket.priority],
      ["פותח קריאה", employee?.full_name ?? "—"],
      ["מחלקה", employee?.department ?? "—"],
      ["טלפון לתקלה", phone || "—"],
      ["מיקום", location || "—"],
      ["חברה", company?.name ?? "—"],
    ];

    const html = layout(
      "קריאת IT חדשה",
      `<h2 style="margin:0 0 8px;font-size:18px;">🛠️ נפתחה קריאת IT חדשה</h2>
       <p style="color:#475569;font-size:14px;">פרטי הקריאה:</p>
       ${detailsTable(rows)}
       ${description ? `<p style="font-size:14px;"><strong>תיאור מפורט:</strong><br>${escapeHtml(description).replaceAll("\n", "<br>")}</p>` : ""}
       <p style="margin:18px 0;">
         <a href="${ticketUrl}" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">פתח את הקריאה במערכת</a>
       </p>`,
    );

    let sent = 0;
    for (const to of recipients) {
      const ok = await enqueueEmail(
        supabase,
        to,
        `🛠️ קריאת IT חדשה — ${ticket.ticket_code} — ${ticket.title}`,
        html,
      );
      if (ok) sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-it-ticket error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
