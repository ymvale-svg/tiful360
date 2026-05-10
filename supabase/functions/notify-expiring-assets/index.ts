// Edge Function: notify-expiring-assets
// Daily cron — for each company, finds assets with custom-date / universal expiry / document expiry
// where days_left == notification_days_before (per asset → per category → 14)
// and sends a single summary email to companies.expiry_notification_emails.
// De-duplication via expiry_notifications_sent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDER_DOMAIN = "notify.bedekclic.com";
const FROM_EMAIL = `noreply@${SENDER_DOMAIN}`;
const FROM_NAME = "תפעול 360";
const PORTAL_BASE = "https://tiful360.lovable.app";

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(title: string, body: string) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
<tr><td style="background:#0f172a;color:#fff;padding:18px 24px;font-size:16px;font-weight:bold;">תפעול 360 — תפוגות מתקרבות</td></tr>
<tr><td style="padding:24px;">${body}</td></tr>
<tr><td style="padding:14px 24px;background:#f1f5f9;color:#64748b;font-size:11px;text-align:center;">הודעה אוטומטית ממערכת תפעול 360</td></tr>
</table>
</td></tr></table></body></html>`;
}

function buildTable(rows: Array<{
  asset_name: string; asset_code: string; category: string; field: string;
  expiry: string; days_left: number; owner: string;
}>) {
  const head = `<thead><tr style="background:#f1f5f9;color:#0f172a;font-size:13px;">
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">פריט</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">קוד</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">קטגוריה</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">סוג תפוגה</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">תאריך</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">ימים שנותרו</th>
    <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0;">בעלים</th>
  </tr></thead>`;
  const body = rows.map(r => {
    const urgent = r.days_left <= 3;
    const color = urgent ? "#dc2626" : "#0f172a";
    return `<tr style="font-size:13px;">
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.asset_name)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;direction:ltr;">${escapeHtml(r.asset_code)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.category)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.field)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;direction:ltr;">${escapeHtml(r.expiry)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;color:${color};">${r.days_left}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(r.owner || "—")}</td>
    </tr>`;
  }).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px;">${head}<tbody>${body}</tbody></table>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Simple shared-secret guard: must present service role key
    const authHeader = req.headers.get("Authorization") ?? "";
    const expected = `Bearer ${SERVICE_ROLE}`;
    if (authHeader !== expected) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: companies, error: cErr } = await supabase
      .from("companies")
      .select("id, name, expiry_notification_emails");
    if (cErr) throw cErr;

    let totalSent = 0;
    let totalCompanies = 0;
    const summary: any[] = [];

    for (const company of companies ?? []) {
      const recipients = (company.expiry_notification_emails ?? "")
        .split(",").map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s));
      if (recipients.length === 0) continue;

      // Get a wide window — filter in code
      const { data: items, error: iErr } = await supabase.rpc("get_expiring_assets", {
        _company_id: company.id, _days_ahead: 60,
      });
      if (iErr) { console.error("get_expiring_assets", company.id, iErr); continue; }

      // Load assets to get notification_days_before + category default
      const assetIds = Array.from(new Set((items ?? []).map((it: any) => it.asset_id)));
      let assetMap = new Map<string, { ndb: number | null; categoryNdb: number | null }>();
      if (assetIds.length > 0) {
        const { data: assets } = await supabase
          .from("assets")
          .select("id, notification_days_before, asset_categories!inner(default_notification_days_before)")
          .in("id", assetIds);
        for (const a of assets ?? []) {
          assetMap.set(a.id, {
            ndb: (a as any).notification_days_before,
            categoryNdb: (a as any).asset_categories?.default_notification_days_before ?? null,
          });
        }
      }

      // Filter: days_left == effective notification_days_before; only future or today
      const filtered = (items ?? []).filter((it: any) => {
        const m = assetMap.get(it.asset_id);
        const effective = m?.ndb ?? m?.categoryNdb ?? 14;
        return it.days_left === effective;
      });

      if (filtered.length === 0) continue;

      // Dedup against expiry_notifications_sent
      const toNotify: any[] = [];
      for (const it of filtered) {
        const fieldKey = it.source_type === "asset" ? "__main__" :
          it.source_type === "custom_field" ? `cf:${it.field_key}` :
          `doc:${it.source_id}`;
        const { data: existing } = await supabase
          .from("expiry_notifications_sent")
          .select("id")
          .eq("asset_id", it.asset_id)
          .eq("field_key", fieldKey)
          .eq("expiry_date", it.expiry_date)
          .maybeSingle();
        if (!existing) toNotify.push({ ...it, _field_key: fieldKey });
      }

      if (toNotify.length === 0) continue;

      const rows = toNotify.map((it: any) => ({
        asset_name: it.asset_name,
        asset_code: it.asset_code,
        category: it.category_name,
        field: it.field_label,
        expiry: it.expiry_date,
        days_left: it.days_left,
        owner: it.owner_name ?? "",
      }));

      const html = layout("תפוגות מתקרבות",
        `<h2 style="margin:0 0 8px;font-size:18px;">⏰ ${rows.length} תפוגות מתקרבות — ${escapeHtml(company.name)}</h2>
         <p style="color:#475569;font-size:14px;">להלן רשימת המשאבים שתפוגתם מתקרבת בהתאם להגדרות ההתראה:</p>
         ${buildTable(rows)}
         <p style="margin:18px 0;">
           <a href="${PORTAL_BASE}/assets" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">פתח את ניהול הציוד</a>
         </p>`);

      const subject = `⏰ ${rows.length} תפוגות מתקרבות — ${company.name}`;

      let sent = 0;
      for (const to of recipients) {
        const { error } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to,
            from: { email: FROM_EMAIL, name: FROM_NAME },
            subject,
            html,
            template_name: "expiring_assets_summary",
          },
        });
        if (!error) sent++;
        else console.error("enqueue error", to, error);
      }

      // Mark as sent (one row per item, regardless of recipients)
      if (sent > 0) {
        const inserts = toNotify.map((it: any) => ({
          company_id: company.id,
          asset_id: it.asset_id,
          field_key: it._field_key,
          expiry_date: it.expiry_date,
        }));
        const { error: insErr } = await supabase
          .from("expiry_notifications_sent")
          .insert(inserts);
        if (insErr) console.error("notifications_sent insert", insErr);
      }

      totalSent += sent;
      totalCompanies++;
      summary.push({ company: company.name, items: toNotify.length, recipients: recipients.length, sent });
    }

    return new Response(JSON.stringify({ ok: true, totalCompanies, totalSent, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-expiring-assets error", err);
    return new Response(JSON.stringify({ error: (err as Error).message ?? "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
