import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await anonClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: callerRoles } = await anonClient.from("user_roles").select("role").eq("user_id", caller.id);
    const callerIsSuperAdmin = callerRoles?.some((r: any) => r.role === "super_admin");
    const isAdmin = callerRoles?.some((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Helper: get caller's company IDs
    const getCallerCompanyIds = async () => {
      const { data } = await adminClient
        .from("user_company_access")
        .select("company_id")
        .eq("user_id", caller.id);
      return (data ?? []).map((a: any) => a.company_id);
    };

    // Helper: check if target user shares a company with caller
    const isInCallerCompanies = async (targetUserId: string) => {
      const callerCompanyIds = await getCallerCompanyIds();
      if (callerCompanyIds.length === 0) return false;
      const { data } = await adminClient
        .from("user_company_access")
        .select("id")
        .eq("user_id", targetUserId)
        .in("company_id", callerCompanyIds)
        .limit(1);
      return (data ?? []).length > 0;
    };

    if (req.method === "GET" && action === "list") {
      const companyId = url.searchParams.get("company_id");

      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;

      const { data: allRoles } = await adminClient.from("user_roles").select("*");

      // Get user IDs that belong to the requested company
      let companyUserIds: Set<string> | null = null;
      if (companyId && !callerIsSuperAdmin) {
        // Verify caller has access to this company
        const { data: callerAccess } = await adminClient
          .from("user_company_access")
          .select("id")
          .eq("user_id", caller.id)
          .eq("company_id", companyId)
          .limit(1);
        if (!callerAccess || callerAccess.length === 0) {
          return new Response(JSON.stringify({ error: "No access to this company" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (companyId) {
        const { data: companyAccess } = await adminClient
          .from("user_company_access")
          .select("user_id")
          .eq("company_id", companyId);
        companyUserIds = new Set((companyAccess ?? []).map((a: any) => a.user_id));
      } else if (!callerIsSuperAdmin) {
        const { data: callerCompanyAccess } = await adminClient
          .from("user_company_access")
          .select("company_id")
          .eq("user_id", caller.id);
        const callerCompanyIds = (callerCompanyAccess ?? []).map((a: any) => a.company_id);
        if (callerCompanyIds.length > 0) {
          const { data: companyUsers } = await adminClient
            .from("user_company_access")
            .select("user_id")
            .in("company_id", callerCompanyIds);
          companyUserIds = new Set((companyUsers ?? []).map((a: any) => a.user_id));
        } else {
          companyUserIds = new Set();
        }
      }

      const filteredUsers = companyUserIds
        ? users.filter((u: any) => companyUserIds!.has(u.id))
        : users;

      const enriched = filteredUsers.map((u: any) => ({
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

      // Only super_admin can assign/remove super_admin role
      if (role === "super_admin" && !callerIsSuperAdmin) {
        return new Response(JSON.stringify({ error: "Only super_admin can assign super_admin role" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Non-super-admin can only manage roles for users in their companies
      if (!callerIsSuperAdmin && !(await isInCallerCompanies(user_id))) {
        return new Response(JSON.stringify({ error: "No access to this user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (remove) {
        await adminClient.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      } else {
        await adminClient.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "invite") {
      const body = await req.json();
      const company_id: string | undefined = body.company_id;
      const default_role: string = body.role || "employee";
      const employees: Array<{ employee_id?: string; email: string; full_name?: string }> =
        Array.isArray(body.employees) ? body.employees : [];

      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (employees.length === 0) {
        return new Response(JSON.stringify({ error: "employees array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify caller has access to the company
      if (!callerIsSuperAdmin) {
        const { data: callerAccess } = await adminClient
          .from("user_company_access")
          .select("id")
          .eq("user_id", caller.id)
          .eq("company_id", company_id)
          .limit(1);
        if (!callerAccess || callerAccess.length === 0) {
          return new Response(JSON.stringify({ error: "No access to this company" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Lookup company name (used by invite email template)
      const { data: companyRow } = await adminClient
        .from("companies")
        .select("name")
        .eq("id", company_id)
        .maybeSingle();
      const companyName = companyRow?.name ?? "";

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "";
      const redirectTo = origin ? `${origin}/welcome` : undefined;

      const results: Array<{ email: string; status: string; error?: string; employee_id?: string }> = [];

      // Pre-fetch existing users to detect duplicates
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      const emailToUser = new Map<string, any>();
      for (const u of existingUsers ?? []) {
        if (u.email) emailToUser.set(u.email.toLowerCase(), u);
      }

      for (const emp of employees) {
        const email = (emp.email || "").trim().toLowerCase();
        if (!email) {
          results.push({ email: emp.email || "", status: "skipped", error: "no email", employee_id: emp.employee_id });
          continue;
        }

        try {
          let userId: string | null = null;
          const existing = emailToUser.get(email);

          if (existing) {
            userId = existing.id;
            results.push({ email, status: "already_exists", employee_id: emp.employee_id });
          } else {
            const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
              data: { full_name: emp.full_name || null, company_name: companyName },
              redirectTo,
            });
            if (inviteErr || !invited?.user) {
              results.push({ email, status: "failed", error: inviteErr?.message || "invite failed", employee_id: emp.employee_id });
              continue;
            }
            userId = invited.user.id;
            results.push({ email, status: "invited", employee_id: emp.employee_id });
          }

          if (userId) {
            // Grant company access
            await adminClient.from("user_company_access").upsert(
              { user_id: userId, company_id, role: default_role as any },
              { onConflict: "user_id,company_id" },
            );
            // Grant app role
            await adminClient.from("user_roles").upsert(
              { user_id: userId, role: default_role as any },
              { onConflict: "user_id,role" },
            );
            // Link employee record if provided
            if (emp.employee_id) {
              await adminClient
                .from("employees")
                .update({ linked_user_id: userId })
                .eq("id", emp.employee_id)
                .eq("company_id", company_id);
            }
          }
        } catch (e: any) {
          results.push({ email, status: "failed", error: e?.message || "unknown error", employee_id: emp.employee_id });
        }
      }

      const summary = {
        total: employees.length,
        invited: results.filter((r) => r.status === "invited").length,
        already_exists: results.filter((r) => r.status === "already_exists").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        failed: results.filter((r) => r.status === "failed").length,
      };

      return new Response(JSON.stringify({ success: true, summary, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "invite-external") {
      const body = await req.json();
      const email: string = (body.email || "").trim().toLowerCase();
      const full_name: string = (body.full_name || "").trim();
      const role: string = body.role;
      const company_ids: string[] = Array.isArray(body.company_ids) ? body.company_ids : [];

      const allowedRoles = new Set(["admin", "it_manager", "payroll", "operations", "direct_manager", "finance"]);
      if (!email || !role || !allowedRoles.has(role) || company_ids.length === 0) {
        return new Response(JSON.stringify({ error: "email, valid role, and at least one company required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify caller has access to ALL requested companies (unless super_admin)
      if (!callerIsSuperAdmin) {
        const { data: callerAccess } = await adminClient
          .from("user_company_access")
          .select("company_id")
          .eq("user_id", caller.id)
          .in("company_id", company_ids);
        const accessibleIds = new Set((callerAccess ?? []).map((a: any) => a.company_id));
        if (company_ids.some((id) => !accessibleIds.has(id))) {
          return new Response(JSON.stringify({ error: "No access to one or more companies" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/$/, "") || "";
      const redirectTo = origin ? `${origin}/welcome` : undefined;

      // Check if user already exists
      const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      let userId: string | null = null;
      let status = "invited";
      const existing = (existingUsers ?? []).find((u: any) => u.email?.toLowerCase() === email);

      if (existing) {
        userId = existing.id;
        status = "already_exists";
      } else {
        const { data: invited, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { full_name: full_name || null },
          redirectTo,
        });
        if (inviteErr || !invited?.user) {
          return new Response(JSON.stringify({ error: inviteErr?.message || "invite failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = invited.user.id;
      }

      // Assign role (NOT employee — external user)
      await adminClient.from("user_roles").upsert(
        { user_id: userId!, role: role as any },
        { onConflict: "user_id,role" },
      );

      // Grant access to each requested company
      for (const cid of company_ids) {
        await adminClient.from("user_company_access").upsert(
          { user_id: userId!, company_id: cid, role: role as any },
          { onConflict: "user_id,company_id" },
        );
      }

      return new Response(JSON.stringify({ success: true, status, user_id: userId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "ban") {
      const { user_id, ban } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot ban yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Non-super-admin can only ban users in their companies
      if (!callerIsSuperAdmin && !(await isInCallerCompanies(user_id))) {
        return new Response(JSON.stringify({ error: "No access to this user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Prevent banning a super_admin unless caller is also super_admin
      if (!callerIsSuperAdmin) {
        const { data: targetRoles } = await adminClient.from("user_roles").select("role").eq("user_id", user_id);
        const targetIsSuperAdmin = targetRoles?.some((r: any) => r.role === "super_admin");
        if (targetIsSuperAdmin) {
          return new Response(JSON.stringify({ error: "Cannot ban a super_admin" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      if (ban) {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });
      } else {
        await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("manage-users error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
