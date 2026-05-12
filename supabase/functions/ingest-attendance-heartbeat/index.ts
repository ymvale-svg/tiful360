import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface HeartbeatPayload {
  company_id: string;
  device_key?: string;
  agent_version?: string;
  clock_ip?: string;
  clock_reachable?: boolean;
  last_error?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expectedToken = Deno.env.get("ATTENDANCE_INGEST_TOKEN");
    if (!expectedToken) return json({ error: "server_misconfigured" }, 500);

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== expectedToken) return json({ error: "unauthorized" }, 401);

    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: HeartbeatPayload;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    if (!body?.company_id) {
      return json({ error: "missing_fields", details: "company_id required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();
    const reachable = body.clock_reachable === true;

    const row = {
      company_id: body.company_id,
      device_key: body.device_key ?? "default",
      agent_version: body.agent_version ?? null,
      clock_ip: body.clock_ip ?? null,
      clock_reachable: typeof body.clock_reachable === "boolean" ? body.clock_reachable : null,
      last_error: body.last_error ?? null,
      last_seen_at: now,
      last_success_at: reachable ? now : undefined,
    };

    // Try update first; if no row, insert
    const { data: updated, error: updErr } = await supabase
      .from("attendance_agent_heartbeats")
      .update(row)
      .eq("company_id", row.company_id)
      .eq("device_key", row.device_key)
      .select("id");

    if (updErr) {
      console.error("update error", updErr);
      return json({ error: "update_failed", details: updErr.message }, 500);
    }

    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase
        .from("attendance_agent_heartbeats")
        .insert({ ...row, last_success_at: reachable ? now : null });
      if (insErr) {
        console.error("insert error", insErr);
        return json({ error: "insert_failed", details: insErr.message }, 500);
      }
    }

    return json({ ok: true, at: now });
  } catch (e) {
    console.error("unhandled", e);
    return json({ error: "internal_error", details: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
