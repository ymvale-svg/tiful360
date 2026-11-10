import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Invitation links must point at the app root + /welcome. The referer header
// carries a full page URL (e.g. https://app.com/employees?tab=users), so it is
// normalized to its origin — concatenating it directly produced dead 404 links.
function resolveAppOrigin(req: Request): string {
  const candidates = [req.headers.get("origin"), req.headers.get("referer")];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return new URL(c).origin;
    } catch {
      // ignore malformed values
    }
  }
  return Deno.env.get("APP_SITE_URL") || "https://tiful360.com";
}

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Management roles count only in the company where they were granted: the caller's
    // permission-group memberships of that company (same rule as the DB functions
    // can_manage_group_members / can_manage_permission_groups). user_roles is the
    // cross-company union, so an admin of company A who is a plain user in company B
    // must not manage B through it.
    const { data: callerGroupRows } = await adminClient
      .from("permission_group_members")
      .select("company_id, permission_groups(roles)")
      .eq("user_id", caller.id);
    const companiesWithRole = (roles: string[]) =>
      new Set<string>(
        (callerGroupRows ?? [])
          .filter((m: any) => (m.permission_groups?.roles ?? []).some((r: string) => roles.includes(r)))
          .map((m: any) => m.company_id),
      );
    const managedCompanyIds = companiesWithRole(["admin", "hr", "payroll"]);
    // Operations / IT onboard new employees, so they may send employee invites only.
    const inviteCompanyIds = companiesWithRole(["admin", "hr", "payroll", "operations", "it_manager"]);
    const canManageIn = (companyId: string | null | undefined) =>
      !!callerIsSuperAdmin || (!!companyId && managedCompanyIds.has(companyId));
    const canInviteIn = (companyId: string | null | undefined) =>
      !!callerIsSuperAdmin || (!!companyId && inviteCompanyIds.has(companyId));
    const canManage = callerIsSuperAdmin || managedCompanyIds.size > 0;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const canInviteEmployees = callerIsSuperAdmin || inviteCompanyIds.size > 0;
    const allowed = action === "invite" || action === "resend-invite" ? canInviteEmployees : canManage;
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Service-role writes skip the DB audit trigger, so every permission change
    // made here is recorded explicitly with the real caller as actor.
    const audit = async (row: { target_user_id?: string | null; company_id?: string | null; action: string; details: string }) => {
      const { error } = await adminClient.from("permission_audit_log").insert({ actor_user_id: caller.id, ...row });
      if (error) console.error("permission audit insert failed", error);
    };

    // Roles a non-super-admin may hand out, whichever action they use.
    // adminClient is a service-role client and bypasses RLS, so this list is
    // the only thing standing between a caller and any role in app_role —
    // super_admin included. Every action that writes user_roles must consult it.
    const ADMIN_ASSIGNABLE_ROLES = new Set([
      "employee",
      "operations",
      "direct_manager",
      "finance",
      "legal",
    ]);

    // Management roles are granted per company through the company's default permission
    // group; a DB trigger derives user_roles from group memberships. Only the platform role
    // (super_admin) and the portal role (employee) are written to user_roles directly.
    const PLATFORM_ROLES = new Set(["super_admin", "employee"]);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const setRoleInCompany = async (userId: string, companyId: string | null, role: string, remove: boolean) => {
      if (PLATFORM_ROLES.has(role)) {
        if (remove) {
          await adminClient.from("user_roles").delete().eq("user_id", userId).eq("role", role);
        } else {
          await adminClient.from("user_roles").upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
        }
        return `תפקיד: ${role}`;
      }
      if (!companyId) throw new Error("company_id required for this role");
      const { data: group, error: groupErr } = await adminClient
        .from("permission_groups")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("system_key", role)
        .maybeSingle();
      if (groupErr) throw groupErr;
      if (!group) throw new Error("default permission group not found");
      if (remove) {
        const { error } = await adminClient.from("permission_group_members").delete()
          .eq("group_id", group.id).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await adminClient.from("permission_group_members").upsert(
          { group_id: group.id, user_id: userId, company_id: companyId, added_by: caller.id },
          { onConflict: "group_id,user_id" },
        );
        if (error) throw error;
      }
      return `קבוצה: ${group.name}`;
    };

    // Helper: check if target user belongs to one of the given companies of the caller
    // (managedCompanyIds / inviteCompanyIds — where the caller holds the needed role).
    const isInCallerCompanies = async (targetUserId: string, companyIds: Set<string>) => {
      const callerCompanyIds = [...companyIds];
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
      // Group memberships of the requested company only — companies are fully separate.
      const { data: memberships } = companyId
        ? await adminClient
            .from("permission_group_members")
            .select("user_id, permission_groups(id, name, roles)")
            .eq("company_id", companyId)
        : { data: [] as any[] };

      // Get user IDs that belong to the requested company
      let companyUserIds: Set<string> | null = null;
      if (companyId && !callerIsSuperAdmin) {
        // Verify caller manages this company (admin/hr/payroll there)
        if (!canManageIn(companyId)) {
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
        const callerCompanyIds = [...managedCompanyIds];
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
        roles: companyId
          ? Array.from(new Set([
              ...(allRoles ?? []).filter((r: any) => r.user_id === u.id && PLATFORM_ROLES.has(r.role)).map((r: any) => r.role),
              ...(memberships ?? []).filter((m: any) => m.user_id === u.id).flatMap((m: any) => m.permission_groups?.roles ?? []),
            ]))
          : allRoles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) || [],
        groups: (memberships ?? [])
          .filter((m: any) => m.user_id === u.id && m.permission_groups)
          .map((m: any) => ({ id: m.permission_groups.id, name: m.permission_groups.name })),
      }));

      return new Response(JSON.stringify(enriched), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "set-role") {
      const { user_id, role, remove, company_id } = await req.json();
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id and role required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Server-side allowlist (shared with the invite action above):
      // admin/payroll/it_manager/super_admin stay assignable by super_admin only.
      if (!callerIsSuperAdmin && !ADMIN_ASSIGNABLE_ROLES.has(role)) {
        return new Response(
          JSON.stringify({ error: "Only super_admin can assign this role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Admin cannot modify their own roles via this endpoint (prevents self-escalation paths).
      if (!callerIsSuperAdmin && user_id === caller.id) {
        return new Response(
          JSON.stringify({ error: "Cannot modify your own roles" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Non-super-admin can only manage roles for users in their companies
      if (!callerIsSuperAdmin && !(await isInCallerCompanies(user_id, managedCompanyIds))) {
        return new Response(JSON.stringify({ error: "No access to this user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!PLATFORM_ROLES.has(role)) {
        if (!company_id) return json({ error: "company_id required" }, 400);
        if (!canManageIn(company_id)) {
          return json({ error: "No access to this company" }, 403);
        }
      }

      const details = await setRoleInCompany(user_id, company_id ?? null, role, !!remove);
      await audit({
        target_user_id: user_id,
        company_id: PLATFORM_ROLES.has(role) ? null : company_id,
        action: PLATFORM_ROLES.has(role)
          ? (remove ? "user_roles_delete" : "user_roles_insert")
          : (remove ? "permission_group_members_delete" : "permission_group_members_insert"),
        details,
      });

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    if (req.method === "POST" && action === "invite") {
      const body = await req.json();
      const company_id: string | undefined = body.company_id;
      // Ops/IT may only invite plain employees; role escalation stays with admins.
      const default_role: string = canManageIn(company_id) ? (body.role || "employee") : "employee";

      // Same allowlist the other actions enforce. Without it, an admin/hr/payroll
      // caller could invite an address that already has an account — their own —
      // and have the service-role upsert below grant it super_admin.
      if (!callerIsSuperAdmin && !ADMIN_ASSIGNABLE_ROLES.has(default_role)) {
        return new Response(
          JSON.stringify({ error: "Only super_admin can assign this role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const employees: Array<{ employee_id?: string; email: string; full_name?: string }> =
        Array.isArray(body.employees) ? body.employees : [];

      if (!company_id) {
        return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (employees.length === 0) {
        return new Response(JSON.stringify({ error: "employees array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Verify caller may invite in this company (role held there) and has access to it
      if (!canInviteIn(company_id)) {
        return new Response(JSON.stringify({ error: "No access to this company" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
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

      const origin = resolveAppOrigin(req);
      const redirectTo = `${origin}/welcome`;

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

          // Inviting is for other people. A caller must never be able to
          // re-grant their own roles here — set-role blocks self-edits too.
          if (userId && userId === caller.id && !callerIsSuperAdmin) {
            results[results.length - 1] = {
              email, status: "skipped", error: "cannot change your own roles", employee_id: emp.employee_id,
            };
            continue;
          }

          if (userId) {
            // Grant company access
            await adminClient.from("user_company_access").upsert(
              { user_id: userId, company_id, role: default_role as any },
              { onConflict: "user_id,company_id" },
            );
            // Grant the role in this company (default group, or user_roles for employee)
            await setRoleInCompany(userId, company_id, default_role, false);
            await audit({ target_user_id: userId, company_id, action: "user_invited", details: `הזמנת עובד · תפקיד: ${default_role}` });
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

      const allowedRoles = new Set(["admin", "it_manager", "payroll", "hr", "operations", "direct_manager", "finance", "legal"]);
      if (!email || !role || !allowedRoles.has(role) || company_ids.length === 0) {
        return new Response(JSON.stringify({ error: "email, valid role, and at least one company required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Non-super-admins may only invite users with a restricted set of roles.
      const ADMIN_INVITABLE_ROLES = new Set(["operations", "direct_manager", "finance", "legal"]);
      if (!callerIsSuperAdmin && !ADMIN_INVITABLE_ROLES.has(role)) {
        return new Response(
          JSON.stringify({ error: "Only super_admin can invite users with this role" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }


      // Verify caller has access to ALL requested companies (unless super_admin)
      if (!callerIsSuperAdmin) {
        const { data: callerAccess } = await adminClient
          .from("user_company_access")
          .select("company_id")
          .eq("user_id", caller.id)
          .in("company_id", company_ids);
        const accessibleIds = new Set((callerAccess ?? []).map((a: any) => a.company_id));
        if (company_ids.some((id) => !accessibleIds.has(id) || !canManageIn(id))) {
          return new Response(JSON.stringify({ error: "No access to one or more companies" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      const origin = resolveAppOrigin(req);
      const redirectTo = `${origin}/welcome`;

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

      // Grant access to each requested company, then the role there (NOT employee — external user)
      for (const cid of company_ids) {
        await adminClient.from("user_company_access").upsert(
          { user_id: userId!, company_id: cid, role: role as any },
          { onConflict: "user_id,company_id" },
        );
        await setRoleInCompany(userId!, cid, role, false);
        await audit({ target_user_id: userId!, company_id: cid, action: "user_invited", details: `הזמנת משתמש חיצוני · תפקיד: ${role}` });
      }

      return new Response(JSON.stringify({ success: true, status, user_id: userId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (req.method === "POST" && action === "resend-invite") {
      const { user_id, email, full_name, company_id } = await req.json();
      if (!user_id || !email) {
        return new Response(JSON.stringify({ error: "user_id and email required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (!callerIsSuperAdmin && !(await isInCallerCompanies(user_id, inviteCompanyIds))) {
        return new Response(JSON.stringify({ error: "No access to this user" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: { user: targetUser }, error: getErr } = await adminClient.auth.admin.getUserById(user_id);
      if (getErr || !targetUser) {
        return new Response(JSON.stringify({ error: "User not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (targetUser.email_confirmed_at || targetUser.last_sign_in_at) {
        return new Response(
          JSON.stringify({ success: true, already_active: true, message: "המשתמש כבר אישר את כתובת הדוא״ל או התחבר בעבר" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let companyName = "";
      if (company_id) {
        const { data: companyRow } = await adminClient.from("companies").select("name").eq("id", company_id).maybeSingle();
        companyName = companyRow?.name ?? "";
      }

      const origin = resolveAppOrigin(req);
      const redirectTo = `${origin}/welcome`;

      const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name || targetUser.user_metadata?.full_name || null, company_name: companyName },
        redirectTo,
      });

      if (inviteErr) {
        return new Response(JSON.stringify({ error: inviteErr.message || "resend failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(
        JSON.stringify({ success: true, already_active: false, message: "הזמנה נשלחה מחדש" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && action === "ban") {
      const { user_id, ban } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Cannot ban yourself" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Non-super-admin can only ban users in companies they manage
      if (!callerIsSuperAdmin && !(await isInCallerCompanies(user_id, managedCompanyIds))) {
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
      await audit({ target_user_id: user_id, action: ban ? "user_banned" : "user_unbanned", details: ban ? "חסימת משתמש" : "ביטול חסימה" });

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("manage-users error:", err);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
