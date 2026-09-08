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
import { enqueueTransactionalEmail } from "../_shared/enqueueEmail.ts";
const SENDER_DOMAIN = "notify.tiful360.com";
const FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const FROM_NAME = "תפעול 360";

const PRIORITY_LABELS: Record<string, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "רגיל",
  low: "נמוך",
};

const SUBJECT_LABELS: Record<string, string> = {
  computing: "מיחשוב",
  peripherals: "ציוד היקפי",
  furniture: "ריהוט משרדי",
  software: "תוכנות",
  other: "אחר",
  offboarding: "ניתוקים / סיום העסקה",
  hardware: "תמיכה טכנית",
  access: "הרשאות וגישה",
};

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const LOGO_URL =
  "https://rhzmhiknbcipucfvgkok.supabase.co/storage/v1/object/public/email-assets/logo.png";
const APP_BASE = "https://tiful360.com";

function layout(title: string, body: string) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(
    title,
  )}</title></head><body dir="rtl" style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;direction:rtl;text-align:right;">
  <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;direction:rtl;">
    <tr><td align="center">
      <table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);direction:rtl;text-align:right;">
        <tr><td align="center" style="background:#0f172a;padding:18px 24px;">
          <a href="${APP_BASE}" style="text-decoration:none;display:inline-block;">
            <img src="${LOGO_URL}" width="48" height="48" alt="תפעול 360" style="border-radius:12px;display:block;margin:0 auto 8px;" />
          </a>
          <div style="color:#fff;font-size:16px;font-weight:bold;">תפעול 360 — קריאת שירות חדשה</div>
        </td></tr>
        <tr><td dir="rtl" align="right" style="padding:24px;direction:rtl;text-align:right;">${body}</td></tr>
        <tr><td style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">הודעה אוטומטית ממערכת תפעול 360</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function detailsTable(rows: Array<[string, string]>) {
  return `<table role="presentation" dir="rtl" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:12px 0;direction:rtl;text-align:right;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td align="right" style="color:#64748b;padding:4px 0 4px 12px;text-align:right;white-space:nowrap;">${escapeHtml(
            k,
          )}</td><td align="right" style="font-weight:600;text-align:right;">${escapeHtml(v)}</td></tr>`,
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
  return await enqueueTransactionalEmail(supabase, {
    to,
    subject,
    html,
    label: "service-ticket-new",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Verify caller can read the ticket via RLS using their JWT
    const { data: visible } = await authClient.from("it_tickets").select("id").eq("id", ticket_id).maybeSingle();
    if (!visible) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: ticket, error: ticketErr } = await supabase
      .from("it_tickets")
      .select("*, employees(full_name, phone, email, department), related_asset:assets(asset_name, asset_code, serial_number, license_plate)")
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
      .select("name, it_emails, operations_emails")
      .eq("id", ticket.company_id)
      .single();

    const employee = (ticket as any).employees;

    const parseEmails = (raw: string | null | undefined) =>
      (raw ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s));

    // Operations owns service tickets; IT addresses are kept as extra recipients.
    const recipients = Array.from(
      new Set([
        ...parseEmails(company?.operations_emails),
        ...parseEmails(company?.it_emails),
        ...parseEmails(employee?.email),
      ]),
    );

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, warning: "no recipients configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const description = ticket.description ?? "";
    const location = ticket.location ?? "";
    const phone = ticket.contact_phone ?? employee?.phone ?? "";
    const asset = (ticket as any).related_asset;
    const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];

    const ticketUrl = `${APP_BASE}/it-tickets?ticket=${encodeURIComponent(ticket.ticket_code ?? ticket.id)}`;

    const rows: Array<[string, string]> = [
      ["מספר קריאה", ticket.ticket_code],
      ["נושא", ticket.title],
      ["נושא הקריאה", SUBJECT_LABELS[ticket.subject_category ?? ticket.ticket_type] ?? "אחר"],
      ["דחיפות", PRIORITY_LABELS[ticket.priority] ?? ticket.priority],
      ["פותח קריאה", employee?.full_name ?? "—"],
      ["מחלקה", employee?.department ?? "—"],
      ["טלפון לתקלה", phone || "—"],
      ["מיקום", location || "—"],
      ["חברה", company?.name ?? "—"],
      [
        "פריט קשור",
        asset
          ? `${asset.asset_name} (${asset.license_plate || asset.asset_code || ""})${asset.serial_number ? ` מס' סידורי ${asset.serial_number}` : ""}`
          : "—",
      ],
      [
        "יעד טיפול (SLA)",
        ticket.sla_deadline ? new Date(ticket.sla_deadline).toLocaleString("he-IL") : "—",
      ],
    ];

    const html = layout(
      "קריאת שירות חדשה",
      `<h2 style="margin:0 0 8px;font-size:18px;">🛠️ נפתחה קריאת שירות חדשה</h2>
       <p style="color:#475569;font-size:14px;">פרטי הקריאה:</p>
       ${detailsTable(rows)}
       ${description ? `<p style="font-size:14px;"><strong>תיאור מפורט:</strong><br>${escapeHtml(description).replaceAll("\n", "<br>")}</p>` : ""}
       ${attachments.length ? `<p style="font-size:14px;"><strong>קבצים מצורפים:</strong><br>${attachments.map((a: any) => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>`).join("<br>")}</p>` : ""}
       <p style="margin:18px 0;">
         <a href="${ticketUrl}" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">פתח את הקריאה במערכת</a>
       </p>`,
    );

    let sent = 0;
    for (const to of recipients) {
      const ok = await enqueueEmail(
        supabase,
        to,
        `🛠️ קריאת שירות חדשה — ${ticket.ticket_code} — ${ticket.title}`,
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
