import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const escapeHtml = (s: unknown) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await authClient.auth.getUser();
    const viewer = userRes?.user;
    if (!viewer) return json({ error: "Unauthorized" }, 401);

    const { employee_id, context } = await req.json();
    if (!employee_id) return json({ error: "employee_id required" }, 400);

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const { data: employee } = await admin
      .from("employees")
      .select("id, full_name, employee_code, company_id, linked_user_id")
      .eq("id", employee_id)
      .maybeSingle();
    if (!employee) return json({ error: "not found" }, 404);

    // Self-access is not audited
    if (employee.linked_user_id && employee.linked_user_id === viewer.id) {
      return json({ skipped: "self access" });
    }

    const viewerName =
      (viewer.user_metadata as any)?.display_name ??
      (viewer.user_metadata as any)?.full_name ??
      viewer.email ??
      viewer.id;
    const when = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

    // Audit trail
    await admin.from("activity_log").insert({
      company_id: employee.company_id,
      employee_id: employee.id,
      performed_by: viewer.id,
      action: "צפייה בנתוני שכר",
      entity_type: "payslips",
      entity_id: employee.id,
      details: `${viewerName} צפה בנתוני השכר של ${employee.full_name}${context ? ` (${context})` : ""}`,
    });

    // Recipients: company admins + super admins
    const { data: access } = await admin
      .from("user_company_access")
      .select("user_id, role")
      .eq("company_id", employee.company_id)
      .in("role", ["admin", "super_admin"]);

    const recipients: string[] = [];
    for (const row of access ?? []) {
      if (row.user_id === viewer.id) continue;
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      const email = u?.user?.email;
      if (email && !recipients.includes(email)) recipients.push(email);
    }
    if (recipients.length === 0) return json({ logged: true, skipped: "no admin recipients" });

    const { data: company } = await admin
      .from("companies")
      .select("name")
      .eq("id", employee.company_id)
      .maybeSingle();

    const subject = `בקרה: גישה לנתוני שכר — ${employee.full_name}`;
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: auto;">
        <h2 style="color:#1f2937;">התראת בקרה — צפייה בנתוני שכר</h2>
        <p style="color:#374151;">משתמש צפה בנתוני השכר של עובד אחר במערכת ${escapeHtml(company?.name ?? "")}.</p>
        <table style="width:100%; border-collapse:collapse; margin-top:16px;">
          <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb;"><strong>משתמש צופה:</strong></td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(viewerName)}</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb;"><strong>עובד:</strong></td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(employee.full_name)} (${escapeHtml(employee.employee_code)})</td></tr>
          <tr><td style="padding:8px; border-bottom:1px solid #e5e7eb;"><strong>מועד:</strong></td><td style="padding:8px; border-bottom:1px solid #e5e7eb;">${escapeHtml(when)}</td></tr>
          ${context ? `<tr><td style="padding:8px;"><strong>הקשר:</strong></td><td style="padding:8px;">${escapeHtml(context)}</td></tr>` : ""}
        </table>
        <p style="margin-top:24px; font-size:12px; color:#6b7280;">הודעה אוטומטית לצורכי בקרה — אין צורך להשיב.</p>
      </div>
    `;

    for (const to of recipients) {
      await admin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          to,
          subject,
          html,
          template: "payslip-access-audit",
          metadata: { employee_id, viewer_id: viewer.id },
        },
      });
    }

    return json({ logged: true, notified: recipients.length });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
