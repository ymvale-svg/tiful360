// Edge Function: send-to-mesimon
// Sends a service ticket to the external Mesimon system (משימון).
// Secrets: MESIMON_URL (Render address), MESIMON_API_KEY (shared key),
// MESIMON_COMPANY_IDS (comma-separated company ids allowed to send).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

export function mesimonAllowedCompanies(): string[] {
  return (Deno.env.get("MESIMON_COMPANY_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await authClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);

    const { ticket_id, note } = await req.json().catch(() => ({}));
    if (!ticket_id) return json({ error: "ticket_id required" }, 400);

    const mesimonUrl = (Deno.env.get("MESIMON_URL") ?? "").trim();
    const mesimonKey = (Deno.env.get("MESIMON_API_KEY") ?? "").trim();
    if (!mesimonUrl || !mesimonKey) return json({ error: "mesimon not configured" }, 503);

    // Verify caller can read the ticket via RLS using their JWT
    const { data: visible } = await authClient.from("it_tickets").select("id").eq("id", ticket_id).maybeSingle();
    if (!visible) return json({ error: "Forbidden" }, 403);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: ticket, error: ticketErr } = await supabase
      .from("it_tickets")
      .select("*, employees(full_name, phone, email, department), related_asset:assets(asset_name, asset_code, serial_number, license_plate)")
      .eq("id", ticket_id)
      .single();
    if (ticketErr || !ticket) return json({ error: "ticket not found" }, 404);

    // Only companies listed in MESIMON_COMPANY_IDS may send tickets to Mesimon
    const allowed = mesimonAllowedCompanies();
    if (!allowed.includes(ticket.company_id)) return json({ error: "company not allowed" }, 403);

    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", ticket.company_id)
      .single();

    const employee = (ticket as any).employees;
    const asset = (ticket as any).related_asset;

    const payload = {
      source: "tiful360",
      // Mesimon reads camelCase keys (ticketCode is required); snake_case kept for compatibility.
      ticketCode: ticket.ticket_code,
      priorityLabel: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
      contactPhone: ticket.contact_phone ?? employee?.phone ?? "",
      slaDeadline: ticket.sla_deadline ?? null,
      createdAt: ticket.created_at,
      ticket_code: ticket.ticket_code,
      title: ticket.title,
      description: ticket.description ?? "",
      status: ticket.status,
      priority: ticket.priority,
      priority_label: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
      subject: SUBJECT_LABELS[ticket.subject_category ?? ticket.ticket_type] ?? "אחר",
      location: ticket.location ?? "",
      contact_phone: ticket.contact_phone ?? employee?.phone ?? "",
      sla_deadline: ticket.sla_deadline ?? null,
      created_at: ticket.created_at,
      note: typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null,
      employee: employee
        ? { name: employee.full_name, email: employee.email, phone: employee.phone, department: employee.department }
        : null,
      company: { id: ticket.company_id, name: company?.name ?? "" },
      asset: asset
        ? {
            name: asset.asset_name,
            code: asset.asset_code,
            serial_number: asset.serial_number,
            license_plate: asset.license_plate,
          }
        : null,
    };

    const res = await fetch(mesimonUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mesimonKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 500);
      console.error("mesimon responded", res.status, text);
      return json({ error: "mesimon rejected", status: res.status }, 502);
    }

    // Record the forward on the ticket (who sent it, when)
    try {
      const senderId = (claims.claims as any)?.sub ?? null;
      let senderName = "";
      const senderEmail = (claims.claims as any)?.email ?? "";
      if (senderId) {
        const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", senderId).maybeSingle();
        senderName = prof?.full_name ?? "";
      }
      if (!senderName && senderEmail) senderName = senderEmail;
      const { data: cur } = await supabase.from("it_tickets").select("it_forwards").eq("id", ticket_id).maybeSingle();
      const forwards = Array.isArray(cur?.it_forwards) ? [...(cur!.it_forwards as any[])] : [];
      forwards.push({
        at: new Date().toISOString(),
        by_id: senderId,
        by_name: senderName || "—",
        by_email: senderEmail || null,
        note: payload.note,
        target: "mesimon",
        recipients: ["משימון"],
        sent: 1,
      });
      await supabase.from("it_tickets").update({ it_forwards: forwards }).eq("id", ticket_id);
    } catch (logErr) {
      console.error("failed to record mesimon forward", logErr);
    }

    return json({ ok: true, sent: 1 });
  } catch (err) {
    console.error("send-to-mesimon error", err);
    return json({ error: (err as Error).message ?? "unknown" }, 500);
  }
});
