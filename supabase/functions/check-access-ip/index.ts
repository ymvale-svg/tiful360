// Checks whether the caller's IP is allowed to enter the app.
// If the allowed_ips table is empty, everyone is allowed (feature off).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const ip = clientIp(req);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await admin.from("allowed_ips").select("ip");
    if (error) throw error;

    // Empty list = restriction off, everyone allowed.
    const allowed = !data || data.length === 0 || data.some((r) => r.ip === ip);

    return new Response(JSON.stringify({ allowed, ip }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Fail open so a misconfiguration never locks everyone out.
    return new Response(JSON.stringify({ allowed: true, error: String(e) }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
