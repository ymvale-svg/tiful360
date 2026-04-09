import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller with anon client
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin role
    const { data: callerRoles } = await anonClient.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "list") {
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;

      // Get all roles
      const { data: allRoles } = await adminClient.from("user_roles").select("*");

      const enriched = users.map((u: any) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        full_name: u.user_metadata?.full_name || u.user_metadata?.name || null,
        avatar_url: u.user_metadata?.avatar_url || null,
        provider: u.app_metadata?.provider || "email",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        banned: u.banned_until ? (new Date(u.banned_until) > new Date()) : false,
        banned_until: u.banned_until,
        roles: allRoles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) || [],
      }));

      return new Response(JSON.stringify(enriched), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "set-role") {
      const { user_id, role, remove } = await req.json();
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id and role required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (remove) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      } else {
        await adminClient.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "ban") {
      const { user_id, ban } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot ban yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (ban) {
        // Ban for 100 years
        const banUntil = new Date();
        banUntil.setFullYear(banUntil.getFullYear() + 100);
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      } else {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
