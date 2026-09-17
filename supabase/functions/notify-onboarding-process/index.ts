// Edge Function: notify-onboarding-process
// Emails the onboarding needs form to the operations recipients
// (companies.operations_emails + companies.it_emails) when HR sends it to ops.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import { enqueueTransactionalEmail } from "../_shared/enqueueEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OWNER_LABELS: Record<string, string> = {
  it_manager: "מנהל IT",
  operations: "תפעול",
  hr: "משאבי אנוש",
  payroll: "חשבות שכר",
  admin: "מנהל מערכת",
  secretariat: "מזכירות",
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
        <tr><td style="background:#0f172a;color:#fff;padding:18px 24px;font-size:16px;font-weight:bold;">תפעול 360 — טופס קליטת עובד</td></tr>
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await authClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const process_id = body?.process_id;
    const document_path = typeof body?.document_path === "string" ? body.document_path : null;
    const isFinal = body?.final === true;
    if (!process_id || typeof process_id !== "string") {
      return new Response(JSON.stringify({ error: "process_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller must be able to read the process through RLS
    const { data: visible } = await authClient
      .from("onboarding_processes")
      .select("id")
      .eq("id", process_id)
      .maybeSingle();
    if (!visible) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: proc, error: procErr } = await supabase
      .from("onboarding_processes")
      .select(
        "*, employees(full_name, employee_code, role, department, start_date, email, phone), onboarding_items(title, owner_role, notes, item_type)",
      )
      .eq("id", process_id)
      .single();

    if (procErr || !proc) {
      return new Response(JSON.stringify({ error: "process not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: company } = await supabase
      .from("companies")
      .select("name, operations_emails, it_emails, hr_emails")
      .eq("id", (proc as any).company_id)
      .single();

    // The requesting HR user also receives a copy of the protocol.
    const requesterEmail =
      typeof (claims.claims as any)?.email === "string" ? (claims.claims as any).email : "";

    const recipients = Array.from(
      new Set(
        [
          company?.operations_emails ?? "",
          company?.it_emails ?? "",
          company?.hr_emails ?? "",
          requesterEmail,
        ]
          .join(",")
          .split(",")
          .map((s: string) => s.trim().toLowerCase())
          .filter((s: string) => s.length > 0 && /^\S+@\S+\.\S+$/.test(s)),
      ),
    );

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, warning: "no operations recipients configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Long-lived signed link to the stored protocol PDF.
    let documentUrl: string | null = null;
    if (document_path) {
      const { data: signed } = await supabase.storage
        .from("employee-documents")
        .createSignedUrl(document_path, 60 * 60 * 24 * 30);
      documentUrl = signed?.signedUrl ?? null;
    }

    const emp = (proc as any).employees ?? {};
    const items = ((proc as any).onboarding_items ?? []) as Array<any>;

    const rows: Array<[string, string]> = [
      ["עובד", emp.full_name ?? "—"],
      ["מספר עובד", emp.employee_code ?? "—"],
      ["תפקיד", emp.role ?? "—"],
      ["מחלקה", emp.department ?? "—"],
      ["תאריך קליטה", emp.start_date ?? "—"],
      ["טלפון", emp.phone ?? "—"],
      ["חברה", company?.name ?? "—"],
      ["מספר פריטים", String(items.length)],
    ];

    const itemsHtml = items.length
      ? `<table role="presentation" cellpadding="8" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;margin:12px 0;">
          <tr style="background:#f1f5f9;color:#475569;">
            <th align="right" style="padding:8px;">פריט</th>
            <th align="right" style="padding:8px;">אחראי</th>
            <th align="right" style="padding:8px;">הערות</th>
          </tr>
          ${items
            .map(
              (i) =>
                `<tr style="border-top:1px solid #e2e8f0;">
                  <td style="padding:8px;font-weight:600;">${escapeHtml(i.title ?? "")}</td>
                  <td style="padding:8px;">${escapeHtml(OWNER_LABELS[i.owner_role] ?? i.owner_role ?? "—")}</td>
                  <td style="padding:8px;color:#475569;">${escapeHtml(i.notes ?? "—")}</td>
                </tr>`,
            )
            .join("")}
        </table>`
      : "";

    const url = `https://tiful360.com/onboarding`;

    const docHtml = documentUrl
      ? `<p style="margin:14px 0;">
           <a href="${documentUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">הורדת פרוטוקול בקשת פתיחת הרשאות וציוד (PDF)</a>
         </p>
         <p style="color:#64748b;font-size:12px;">המסמך נשמר גם במסמכים שבתיק העובד במערכת.</p>`
      : "";

    const heading = isFinal
      ? "✅ תהליך הקליטה הושלם — פרוטוקול מעודכן (גרסה 2)"
      : "🧑‍💼 התקבל טופס קליטת עובד חדש";
    const intro = isFinal
      ? "כל הפריטים בתהליך הקליטה בוצעו. מצורף הפרוטוקול המעודכן הכולל את מועדי הביצוע בפועל:"
      : "משאבי אנוש שלחו לתפעול טופס צרכי קליטה:";

    const html = layout(
      isFinal ? "פרוטוקול קליטה מעודכן" : "טופס קליטת עובד",
      `<h2 style="margin:0 0 8px;font-size:18px;">${heading}</h2>
       <p style="color:#475569;font-size:14px;">${intro}</p>
       ${detailsTable(rows)}
       ${itemsHtml}
       ${docHtml}
       <p style="margin:18px 0;">
         <a href="${url}" style="background:#0f172a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;font-weight:600;">פתח את הצ'קליסט במערכת</a>
       </p>`,
    );

    let sent = 0;
    for (const to of recipients) {
      const ok = await enqueueTransactionalEmail(supabase, {
        to,
        subject: isFinal
          ? `✅ פרוטוקול קליטה מעודכן — ${emp.full_name ?? ""}`
          : `🧑‍💼 טופס קליטת עובד — ${emp.full_name ?? ""}`,
        html,
        label: isFinal ? "onboarding-process-completed" : "onboarding-process-sent",
        idempotencyKey: `onboarding-${isFinal ? "final-" : ""}${process_id}-${to}`,
        metadata: { process_id, final: isFinal },
      });
      if (ok) sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent, total: recipients.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-onboarding-process error", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message ?? "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
