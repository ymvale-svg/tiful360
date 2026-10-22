// Edge Function: mesimon-status
// Returns whether the given company may send tickets to Mesimon (משימון).
// Used by the client to decide whether to show the "שלח למשימון" button.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id) return json({ error: "company_id required" }, 400);

    const configured =
      !!(Deno.env.get("MESIMON_URL") ?? "").trim() && !!(Deno.env.get("MESIMON_API_KEY") ?? "").trim();
    const allowed = (Deno.env.get("MESIMON_COMPANY_IDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    return json({ enabled: configured && allowed.includes(company_id) });
  } catch (err) {
    console.error("mesimon-status error", err);
    return json({ error: (err as Error).message ?? "unknown" }, 500);
  }
});
