import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fmtDateIL } from "../_shared/formatDate.ts";
import { formatEmailHtml } from "../_shared/email-html.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function storagePath(value: string): string {
  const marker = "/tax-forms-101/";
  const idx = value.indexOf(marker);
  return idx >= 0 ? value.slice(idx + marker.length).split("?")[0] : value;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// deno-lint-ignore no-explicit-any
async function downloadBase64(client: any, path: string): Promise<string> {
  const { data, error } = await client.storage.from("tax-forms-101").download(path);
  if (error || !data) throw new Error(`Failed to download ${path}: ${error?.message ?? "no data"}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { form_id, access_token } = await req.json();
    if (!form_id) {
      return new Response(JSON.stringify({ error: "form_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // AuthZ: either authenticated caller with RLS-visible form, OR valid access_token for the form
    const authHeader = req.headers.get("Authorization");
    let authorized = false;
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: claims } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
      if (claims?.claims) {
        const { data: visible } = await authClient.from("tax_form_101").select("id").eq("id", form_id).maybeSingle();
        if (visible) authorized = true;
      }
    }
    if (!authorized && access_token) {
      const { data: tokenMatch } = await supabase.from("tax_form_101").select("id").eq("id", form_id).eq("access_token", access_token).maybeSingle();
      if (tokenMatch) authorized = true;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load form + employee + company
    const { data: form, error: fErr } = await supabase
      .from("tax_form_101")
      .select("*")
      .eq("id", form_id)
      .single();
    if (fErr || !form) throw new Error("Form not found");
    if (!form.pdf_url) throw new Error("Form has no PDF yet");

    const { data: employee } = await supabase
      .from("employees")
      .select("full_name, email")
      .eq("id", form.employee_id)
      .single();
    const { data: company } = await supabase
      .from("companies")
      .select("name, logo_url, payroll_emails")
      .eq("id", form.company_id)
      .single();

    const payrollList = (company?.payroll_emails ?? "")
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);

    if (payrollList.length === 0 && !employee?.email) {
      throw new Error("No payroll emails configured and employee has no email");
    }

    // pdf_url holds the storage path (older rows: a full storage URL). Download it with
    // the service client — the bucket is private, so a plain fetch() cannot read it.
    const pdfBase64 = await downloadBase64(supabase, storagePath(form.pdf_url));

    // Documents the employee attached (recorded by submit_tax_form_101). Attached to the
    // mail up to a total size; anything beyond is listed so payroll opens it in the system.
    const ATTACH_LIMIT = 25 * 1024 * 1024;
    const attachments: { filename: string; content: string }[] = [];
    const notAttached: string[] = [];
    let total = 0;
    const recorded = Array.isArray(form.attachments) ? form.attachments : [];
    for (const a of recorded) {
      const path = typeof a?.path === "string" ? a.path : "";
      const name = typeof a?.name === "string" && a.name ? a.name : path.split("/").pop() ?? "נספח";
      if (!path.startsWith(`${form.company_id}/${form.id}-att-`)) continue;
      const size = typeof a?.size === "number" ? a.size : 0;
      if (total + size > ATTACH_LIMIT) {
        notAttached.push(name);
        continue;
      }
      try {
        attachments.push({ filename: name, content: await downloadBase64(supabase, path) });
        total += size;
      } catch (e) {
        console.warn("tax101 attachment download failed:", path, e);
        notAttached.push(name);
      }
    }

    const empName = employee?.full_name ?? "עובד";
    const fileName = `tofes-101-${empName.replace(/\s+/g, "-")}-${form.tax_year}.pdf`;

    const allRecipients = [...new Set([...payrollList, ...(employee?.email ? [employee.email] : [])])];

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;padding:20px;">
        <h2 style="color:#1e40af;">טופס 101 חתום — ${escapeHtml(empName)}</h2>
        <p>שלום,</p>
        <p>מצורף טופס 101 חתום של <strong>${escapeHtml(empName)}</strong> לשנת המס <strong>${form.tax_year}</strong>${company?.name ? ` בחברת ${company.name}` : ""}.</p>
        <p style="color:#666;font-size:13px;">הטופס נחתם דיגיטלית בתאריך ${fmtDateIL(form.signed_at)}.</p>
        ${recorded.length ? `<p>נספחים שצורפו: <strong>${recorded.length}</strong>${notAttached.length ? ` (${notAttached.length} לא צורפו למייל בגלל גודל — אפשר לפתוח אותם במסך טפסי 101: ${notAttached.map(escapeHtml).join(", ")})` : ""}.</p>` : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="font-size:11px;color:#999;">הודעה זו נשלחה אוטומטית מערכת תיק 360.</p>
      </div>
    `;

    // Send via Resend with attachment
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tiful 360 <onboarding@resend.dev>",
        to: payrollList.length > 0 ? payrollList : [employee!.email],
        cc: payrollList.length > 0 && employee?.email ? [employee.email] : undefined,
        subject: `טופס 101 חתום - ${empName} - שנת ${form.tax_year}`,
        html: formatEmailHtml(html, { companyName: company?.name, companyLogoUrl: company?.logo_url }),
        attachments: [{ filename: fileName, content: pdfBase64 }, ...attachments],
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      throw new Error(resendData?.message ?? "Failed to send email");
    }

    // Update form: sent_at + sent_to + status
    await supabase
      .from("tax_form_101")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_to: allRecipients,
      })
      .eq("id", form_id);

    // Best-effort activity log entry (covers both authenticated submit and token flow)
    try {
      const { data: existingLog } = await supabase
        .from("activity_log")
        .select("id")
        .eq("entity_id", form_id)
        .eq("entity_type", "tax_form_101")
        .eq("action", `מילוי וחתימה על טופס 101 לשנת ${form.tax_year}`)
        .maybeSingle();
      if (!existingLog) {
        await supabase.from("activity_log").insert({
          company_id: form.company_id,
          employee_id: form.employee_id,
          entity_id: form.id,
          entity_type: "tax_form_101",
          action: `מילוי וחתימה על טופס 101 לשנת ${form.tax_year}`,
          details: `הטופס נחתם דיגיטלית ונשלח למחלקת השכר (${allRecipients.join(", ")})`,
          performed_by: form.created_by ?? null,
        });
      }
    } catch (logErr) {
      console.warn("activity_log insert failed:", logErr);
    }

    return new Response(JSON.stringify({ ok: true, recipients: allRecipients, message_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-tax101-email error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
