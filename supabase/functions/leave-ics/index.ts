// Public endpoint that returns an .ics calendar invite for an approved leave request.
// Linked from notification emails so the secretariat can add the absence to Google Calendar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה",
  sick: "מחלה",
  reserve: "מילואים",
  personal: "יום אישי",
  other: "היעדרות",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ymd(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function escapeIcs(s: string) {
  return (s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") ?? "";
    if (!UUID_RE.test(id)) {
      return new Response(JSON.stringify({ error: "invalid id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: request } = await supabase
      .from("leave_requests")
      .select("id, employee_id, request_type, start_date, end_date, status, created_at")
      .eq("id", id)
      .maybeSingle();

    if (!request || request.status !== "approved") {
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: employee } = await supabase
      .from("employees")
      .select("full_name, department")
      .eq("id", request.employee_id)
      .maybeSingle();

    const typeLabel = TYPE_LABELS[request.request_type] ?? "היעדרות";
    const start = new Date(request.start_date);
    const endEx = new Date(request.end_date ?? request.start_date);
    endEx.setDate(endEx.getDate() + 1);

    const title = `${employee?.full_name ?? "עובד"} — ${typeLabel}`;
    const description = `${typeLabel}${employee?.department ? ` · ${employee.department}` : ""}`;
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Tiful360//Leave//HE",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:leave-${request.id}@tiful360`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(endEx)}`,
      `SUMMARY:${escapeIcs(title)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      "TRANSP:TRANSPARENT",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="leave-${request.id}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("leave-ics error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
