import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: "request_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Load request + employee + company
    const { data: request, error: reqErr } = await supabase
      .from("leave_requests")
      .select(`*, 
        employee:employees!leave_requests_employee_id_fkey(full_name, employee_code, department, email),
        company:companies(name, payroll_emails)
      `)
      .eq("id", request_id)
      .single();
    if (reqErr || !request) {
      return new Response(JSON.stringify({ error: reqErr?.message ?? "not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (request.request_type !== "sick") {
      return new Response(JSON.stringify({ skipped: "not a sick leave" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payrollEmailsRaw = (request.company as any)?.payroll_emails ?? "";
    const recipients = String(payrollEmailsRaw)
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 3 && e.includes("@"));

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ skipped: "no payroll emails configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = request.employee as any;
    const company = request.company as any;
    const start = new Date(request.start_date).toLocaleDateString("he-IL");
    const end = new Date(request.end_date).toLocaleDateString("he-IL");

    const subject = `הצהרת מחלה — ${employee?.full_name ?? "עובד"} (${start} – ${end})`;
    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: auto;">
        <h2 style="color: #1f2937;">הצהרת מחלה חדשה — ${company?.name ?? ""}</h2>
        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>עובד:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${employee?.full_name ?? "—"}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>קוד עובד:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${employee?.employee_code ?? "—"}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>מחלקה:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${employee?.department ?? "—"}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>תאריכים:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${start} – ${end}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>סה"כ ימים:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${request.total_days}</td></tr>
          ${request.reason ? `<tr><td style="padding: 8px;"><strong>הערות:</strong></td><td style="padding: 8px;">${request.reason}</td></tr>` : ""}
        </table>
        <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">הודעה אוטומטית — אין צורך להשיב.</p>
      </div>
    `;

    // Enqueue one email per recipient via existing email queue
    const enqueued: number[] = [];
    for (const to of recipients) {
      try {
        const { data: msgId } = await supabase.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            to,
            subject,
            html,
            template: "sick-leave-notification",
            metadata: { request_id, employee_id: request.employee_id },
          },
        });
        if (msgId) enqueued.push(Number(msgId));
      } catch (e) {
        console.error("enqueue failed for", to, e);
      }
    }

    await supabase.from("leave_requests")
      .update({ payroll_notified_at: new Date().toISOString() })
      .eq("id", request_id);

    return new Response(JSON.stringify({ enqueued: enqueued.length, recipients }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
