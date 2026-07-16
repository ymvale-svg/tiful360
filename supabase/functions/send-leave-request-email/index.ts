// Edge Function: send-leave-request-email
// Receives { request_id, event } where event is 'submitted' | 'approved' | 'rejected'.
// Enqueues the appropriate emails into the auth_emails / transactional_emails pgmq queue
// using the existing Lovable email infrastructure.
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

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה",
  sick: "מחלה",
  personal: "יום אישי",
  other: "אחר",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין לאישור",
  approved: "מאושר",
  rejected: "נדחה",
  cancelled: "בוטל",
};

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("he-IL");
  } catch {
    return d;
  }
}

function escapeHtml(s: string) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function baseLayout(title: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7fb;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);">
        <tr><td style="background:#0f172a;color:#fff;padding:18px 24px;font-size:16px;font-weight:bold;">תפעול 360</td></tr>
        <tr><td style="padding:24px;">${bodyHtml}</td></tr>
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

function ctaButton(href: string, label: string) {
  return `<p style="margin:18px 0;">
    <a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">${escapeHtml(
    label,
  )}</a>
  </p>`;
}

async function enqueueEmail(
  supabase: any,
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{ filename: string; url: string }>,
) {
  const payload: Record<string, unknown> = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject,
    html,
    sender_domain: SENDER_DOMAIN,
  };
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { request_id, event } = await req.json();
    if (!request_id || !event) {
      return new Response(JSON.stringify({ error: "request_id and event required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: visible } = await authClient.from("leave_requests").select("id").eq("id", request_id).maybeSingle();
    if (!visible) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load request + employee + manager + company
    const { data: request, error: reqErr } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("id", request_id)
      .single();
    if (reqErr || !request) {
      return new Response(JSON.stringify({ error: "request not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("id, full_name, email, employee_code, id_number, department, role, direct_manager_id")
      .eq("id", request.employee_id)
      .single();

    const { data: company } = await supabase
      .from("companies")
      .select("id, name, payroll_emails, hr_emails")
      .eq("id", request.company_id)
      .single();

    const parseEmailList = (raw: unknown): string[] =>
      String(raw ?? "")
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s));

    const hrList = parseEmailList((company as any)?.hr_emails);

    let manager: any = null;
    if (employee?.direct_manager_id) {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, email")
        .eq("id", employee.direct_manager_id)
        .single();
      manager = data;
    }

    const typeLabel = TYPE_LABELS[request.request_type] ?? request.request_type;
    const dateRange = !request.end_date
      ? `${fmtDate(request.start_date)} – טרם עודכן`
      : request.start_date === request.end_date
        ? fmtDate(request.start_date)
        : `${fmtDate(request.start_date)} – ${fmtDate(request.end_date)}`;
    const baseDetails: Array<[string, string]> = [
      ["עובד", employee?.full_name ?? "—"],
      ["מספר עובד", employee?.employee_code ?? "—"],
      ["מחלקה", employee?.department ?? "—"],
      ["סוג בקשה", typeLabel],
      ["תאריכים", dateRange],
      ["מספר ימים", String(request.total_days ?? 0)],
    ];
    if (request.reason) baseDetails.push(["סיבה / הערות", request.reason]);

    const portalBase =
      req.headers.get("origin") ?? "https://tiful360.lovable.app";
    const reviewUrl = `${portalBase}/leave-requests`;

    // ------- SUBMITTED -------
    if (event === "submitted") {
      if (request.request_type === "sick") {
        // informational — to manager + HR
        const attachLine = request.attachment_url
          ? `<p>אישור מחלה צורף ע"י העובד.</p>`
          : `<p style="color:#b45309;">לא הועלה אישור מחלה. ניתן להעלות אישור בהמשך מתוך הבקשה בפורטל.</p>`;
        const endLine = !request.end_date
          ? `<p style="color:#475569;font-size:13px;">תאריך סיום המחלה טרם עודכן. העובד/ת יעדכן/תעדכן בסיום ההיעדרות.</p>`
          : "";
        const html = baseLayout(
          "עדכון: דיווח מחלה",
          `<h2 style="margin:0 0 8px;font-size:18px;">עדכון — דיווח מחלה</h2>
           <p style="color:#475569;font-size:14px;">${escapeHtml(employee?.full_name ?? "עובד")} דיווח/ה על ימי מחלה. אין צורך באישור — זוהי הודעת עדכון בלבד.</p>
           ${detailsTable(baseDetails)}
           ${endLine}
           ${attachLine}
           ${ctaButton(reviewUrl, "צפייה בבקשה")}`,
        );
        const subj = `📋 עדכון: ${employee?.full_name} דיווח/ה על ימי מחלה`;
        const recipients = new Set<string>();
        if (manager?.email) recipients.add(manager.email);
        for (const e of hrList) recipients.add(e);
        for (const to of recipients) {
          await enqueueEmail(supabase, to, subj, html);
        }
      } else {
        if (!manager?.email) {
          return new Response(
            JSON.stringify({ ok: true, warning: "manager has no email" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const html = baseLayout(
          "בקשה חדשה לאישור",
          `<h2 style="margin:0 0 8px;font-size:18px;">בקשה חדשה לאישור</h2>
           <p style="color:#475569;font-size:14px;">${escapeHtml(employee?.full_name ?? "עובד")} הגיש/ה בקשת ${escapeHtml(typeLabel)}.</p>
           ${detailsTable(baseDetails)}
           ${ctaButton(reviewUrl, "פתח לאישור / דחייה")}`,
        );
        await enqueueEmail(
          supabase,
          manager.email,
          `🔔 בקשת ${typeLabel} חדשה לאישור — ${employee?.full_name}`,
          html,
        );
      }
      await supabase
        .from("leave_requests")
        .update({ manager_notified_at: new Date().toISOString() })
        .eq("id", request.id);
    }

    // ------- SICK CLOSED (end_date + optionally attachment added later) -------
    if (event === "sick-closed") {
      const attachLine = request.attachment_url
        ? `<p>אישור מחלה מצורף.</p>`
        : `<p style="color:#b45309;">לא צורף אישור מחלה. זיכוי הימים מותנה בהמצאת אישור.</p>`;
      const html = baseLayout(
        "סגירת דיווח מחלה",
        `<h2 style="margin:0 0 8px;font-size:18px;">סגירת דיווח מחלה</h2>
         <p style="color:#475569;font-size:14px;">${escapeHtml(employee?.full_name ?? "עובד")} עדכן/ה את סיום ימי המחלה.</p>
         ${detailsTable(baseDetails)}
         ${attachLine}
         ${ctaButton(reviewUrl, "צפייה בבקשה")}`,
      );
      const recipients = new Set<string>();
      if (manager?.email) recipients.add(manager.email);
      for (const e of hrList) recipients.add(e);
      const subj = `📋 סגירת מחלה — ${employee?.full_name}`;
      for (const to of recipients) {
        await enqueueEmail(supabase, to, subj, html);
      }
    }


    // ------- APPROVED -------
    if (event === "approved") {
      // Build Google Calendar link (all-day event)
      const buildGcalUrl = () => {
        if (!request.end_date) return null;
        const toYmd = (s: string) => {
          const d = new Date(s);
          return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
        };
        const endEx = new Date(request.end_date);
        endEx.setDate(endEx.getDate() + 1);
        const endYmd = `${endEx.getFullYear()}${String(endEx.getMonth() + 1).padStart(2, "0")}${String(endEx.getDate()).padStart(2, "0")}`;
        const title = `${employee?.full_name ?? "עובד"} בחופש`;
        const details = `${typeLabel}${request.reason ? ` — ${request.reason}` : ""}`;
        const p = new URLSearchParams({
          action: "TEMPLATE",
          text: title,
          dates: `${toYmd(request.start_date)}/${endYmd}`,
          details,
        });
        return `https://calendar.google.com/calendar/render?${p.toString()}`;
      };
      const gcalUrl = buildGcalUrl();
      const gcalButton = gcalUrl
        ? `<p style="margin:18px 0;">
             <a href="${gcalUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;">📅 הוסף ליומן Google</a>
           </p>`
        : "";

      // Notify employee
      if (employee?.email) {
        const html = baseLayout(
          "הבקשה אושרה",
          `<h2 style="margin:0 0 8px;font-size:18px;color:#16a34a;">✅ הבקשה אושרה</h2>
           <p>שלום ${escapeHtml(employee.full_name)},</p>
           <p>בקשת ה${escapeHtml(typeLabel)} שלך אושרה.</p>
           ${detailsTable(baseDetails)}
           ${request.manager_note ? `<p><strong>הערת מנהל:</strong> ${escapeHtml(request.manager_note)}</p>` : ""}`,
        );
        await enqueueEmail(supabase, employee.email, `✅ בקשת ${typeLabel} אושרה`, html);
      }

      // Notify HR (info + calendar CTA) — exclude the reviewer if HR approved
      let reviewerEmail: string | null = null;
      if (request.reviewed_by) {
        try {
          const { data: ru } = await supabase.auth.admin.getUserById(request.reviewed_by);
          reviewerEmail = ru?.user?.email?.toLowerCase() ?? null;
        } catch (_) { /* ignore */ }
      }
      const infoRecipients = new Set<string>();
      for (const e of hrList) {
        if (reviewerEmail && e.toLowerCase() === reviewerEmail) continue;
        infoRecipients.add(e);
      }
      if (infoRecipients.size > 0) {
        const html = baseLayout(
          "עדכון: בקשת חופשה אושרה",
          `<h2 style="margin:0 0 8px;font-size:18px;">✅ בקשת ${escapeHtml(typeLabel)} אושרה</h2>
           <p style="color:#475569;font-size:14px;">בקשתו/ה של ${escapeHtml(employee?.full_name ?? "עובד")} אושרה. ניתן להוסיף את החופשה ליומן Google.</p>
           ${detailsTable(baseDetails)}
           ${gcalButton}
           ${ctaButton(reviewUrl, "צפייה בבקשה")}`,
        );
        const subj = `✅ ${employee?.full_name} — בקשת ${typeLabel} אושרה`;
        for (const to of infoRecipients) {
          await enqueueEmail(supabase, to, subj, html);
        }
      }

      // Notify payroll
      const payrollList = (company?.payroll_emails ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s));
      if (payrollList.length > 0) {
        const attachments: Array<{ filename: string; url: string }> = [];
        if (request.signed_pdf_url)
          attachments.push({ filename: "טופס_חתום.pdf", url: request.signed_pdf_url });
        if (request.attachment_url)
          attachments.push({ filename: "אישור_מחלה", url: request.attachment_url });

        const detailsForPayroll: Array<[string, string]> = [
          ...baseDetails,
          ["ת.ז.", employee?.id_number ?? "—"],
          ["מאושר ע\"י", manager?.full_name ?? "מנהל מערכת"],
          ["תאריך אישור", fmtDate(request.reviewed_at ?? new Date().toISOString())],
        ];

        const html = baseLayout(
          "אישור בקשת חופשה/מחלה — לעדכון בשכר",
          `<h2 style="margin:0 0 8px;font-size:18px;">אישור בקשת ${escapeHtml(typeLabel)} — לעדכון בשכר</h2>
           <p>חברת ${escapeHtml(company?.name ?? "")} — נשלח אוטומטית עם אישור הבקשה.</p>
           ${detailsTable(detailsForPayroll)}
           ${
             attachments.length > 0
               ? `<p style="font-size:13px;color:#475569;">קישורים מצורפים:</p><ul style="font-size:13px;">${attachments
                   .map(
                     (a) =>
                       `<li><a href="${a.url}" style="color:#2563eb;">${escapeHtml(a.filename)}</a></li>`,
                   )
                   .join("")}</ul>`
               : ""
           }`,
        );
        for (const to of payrollList) {
          await enqueueEmail(supabase, to, `📑 אישור ${typeLabel} — ${employee?.full_name}`, html);
        }
        await supabase
          .from("leave_requests")
          .update({ payroll_notified_at: new Date().toISOString() })
          .eq("id", request.id);
      }
    }

    // ------- REJECTED -------
    if (event === "rejected") {
      if (employee?.email) {
        const html = baseLayout(
          "הבקשה נדחתה",
          `<h2 style="margin:0 0 8px;font-size:18px;color:#dc2626;">❌ הבקשה נדחתה</h2>
           <p>שלום ${escapeHtml(employee.full_name)},</p>
           <p>בקשת ה${escapeHtml(typeLabel)} שלך נדחתה.</p>
           ${detailsTable(baseDetails)}
           ${request.manager_note ? `<p><strong>סיבת דחייה:</strong> ${escapeHtml(request.manager_note)}</p>` : ""}`,
        );
        await enqueueEmail(supabase, employee.email, `❌ בקשת ${typeLabel} נדחתה`, html);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-leave-request-email error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
