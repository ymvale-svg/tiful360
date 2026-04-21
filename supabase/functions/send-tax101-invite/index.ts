import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { form_id } = await req.json();
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

    const { data: form, error: fErr } = await supabase
      .from("tax_form_101")
      .select("*")
      .eq("id", form_id)
      .single();
    if (fErr || !form) throw new Error("Form not found");

    // Ensure token + expiry exist (refresh if missing)
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    let accessToken = form.access_token;
    if (!accessToken || !form.token_expires_at) {
      const { data: updated } = await supabase
        .from("tax_form_101")
        .update({ token_expires_at: expiresAt })
        .eq("id", form_id)
        .select("access_token")
        .single();
      accessToken = updated?.access_token ?? accessToken;
    } else {
      // Just refresh expiry
      await supabase
        .from("tax_form_101")
        .update({ token_expires_at: expiresAt })
        .eq("id", form_id);
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("full_name, email")
      .eq("id", form.employee_id)
      .single();
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", form.company_id)
      .single();

    if (!employee?.email) {
      return new Response(JSON.stringify({ error: "Employee has no email", skipped: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const link = `https://tiful360.com/portal/tax101/${accessToken}`;
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;padding:20px;">
        <h2 style="color:#1e40af;">טופס 101 לשנת ${form.tax_year} ממתין לחתימה</h2>
        <p>שלום ${employee.full_name},</p>
        <p>מחלקת השכר${company?.name ? ` ב${company.name}` : ""} פתחה לך טופס 101 (כרטיס עובד) לשנת המס ${form.tax_year} למילוי וחתימה דיגיטלית.</p>
        <p>תהליך המילוי לוקח כדקה — חלק מהפרטים כבר מילאנו עבורך.</p>
        <p style="margin:30px 0;text-align:center;">
          <a href="${link}" style="background:#1e40af;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;display:inline-block;">
            למילוי וחתימה
          </a>
        </p>
        <p style="font-size:12px;color:#666;">הקישור תקף ל-30 ימים. אם הכפתור לא עובד, העתק לדפדפן:<br/>
          <span style="color:#1e40af;direction:ltr;display:inline-block;">${link}</span>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
        <p style="font-size:11px;color:#999;">הודעה זו נשלחה אוטומטית. אם אינך מזהה את הבקשה, ניתן להתעלם.</p>
      </div>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Tiful 360 <onboarding@resend.dev>",
        to: [employee.email],
        subject: `טופס 101 לשנת ${form.tax_year} ממתין לחתימה`,
        html,
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      throw new Error(resendData?.message ?? "Failed to send invite");
    }

    return new Response(JSON.stringify({ ok: true, link, message_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-tax101-invite error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
