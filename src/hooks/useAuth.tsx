import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { rolesForCompany } from "@/lib/permissionGroups";

import type { AppRole } from "@/lib/screenAccess";
export type { AppRole };

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Roles in the active company: its group roles plus the platform/portal roles. */
  roles: AppRole[];
  /** True until the signed-in user's roles have been fetched. */
  rolesLoading: boolean;
  /** Called by CompanyProvider so roles follow the active company (companies are separate). */
  setRoleCompanyId: (companyId: string | null) => void;
  hasRole: (role: AppRole) => boolean;
  isAdmin: boolean;
  isIT: boolean;
  isEmployee: boolean;
  isSuperAdmin: boolean;
  isDirectManager: boolean;
  isPayroll: boolean;
  isHR: boolean;
  isOperations: boolean;
  isFinance: boolean;
  isLegal: boolean;
  accessBlocked: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  roles: [],
  rolesLoading: true,
  setRoleCompanyId: () => {},
  hasRole: () => false,
  isAdmin: false,
  isIT: false,
  isEmployee: false,
  isSuperAdmin: false,
  isDirectManager: false,
  isPayroll: false,
  isHR: false,
  isOperations: false,
  isFinance: false,
  isLegal: false,
  accessBlocked: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalRoles, setGlobalRoles] = useState<AppRole[]>([]);
  const [memberships, setMemberships] = useState<{ company_id: string; roles: AppRole[] }[] | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [roleCompanyId, setRoleCompanyId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("activeCompanyId");
    } catch {
      return null;
    }
  });
  const [accessBlocked, setAccessBlocked] = useState(false);

  const checkAccess = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_access_blocked" as any);
    if (!error) setAccessBlocked(!!data);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const [{ data }, groups] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      (supabase.from("permission_group_members" as any) as any)
        .select("company_id, permission_groups(roles)")
        .eq("user_id", userId),
    ]);
    setGlobalRoles((data ?? []).map((r) => r.role as AppRole));
    // Before the groups migration is applied the table is missing: fall back to user_roles.
    setMemberships(
      groups.error
        ? null
        : (groups.data ?? []).map((m: any) => ({ company_id: m.company_id, roles: m.permission_groups?.roles ?? [] })),
    );
    setRolesLoading(false);
  }, []);

  const clearRoles = useCallback(() => {
    setGlobalRoles([]);
    setMemberships(null);
    setRolesLoading(false);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        // A fresh sign-in has no roles yet; token refreshes keep the current ones visible.
        if (_event === "SIGNED_IN") setRolesLoading(true);
        setTimeout(() => { fetchRoles(session.user.id); checkAccess(); }, 0);
      } else {
        clearRoles();
        setAccessBlocked(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchRoles(session.user.id);
        checkAccess();
      } else {
        setRolesLoading(false);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles, checkAccess, clearRoles]);

  const isSuperAdmin = globalRoles.includes("super_admin");
  const roles = useMemo<AppRole[]>(() => {
    if (isSuperAdmin || memberships === null || !roleCompanyId) return globalRoles;
    return rolesForCompany(globalRoles, memberships, roleCompanyId);
  }, [globalRoles, memberships, roleCompanyId, isSuperAdmin]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role) || roles.includes("super_admin"), [roles]);
  const signOut = async () => {
    await supabase.auth.signOut();
    clearRoles();
    setAccessBlocked(false);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        roles,
        rolesLoading,
        setRoleCompanyId,
        hasRole,
        isAdmin: isSuperAdmin || roles.includes("admin"),
        isIT: isSuperAdmin || roles.includes("it_manager"),
        isEmployee: roles.includes("employee"),
        isSuperAdmin,
        isDirectManager: isSuperAdmin || roles.includes("direct_manager"),
        isPayroll: isSuperAdmin || roles.includes("payroll"),
        isHR: isSuperAdmin || roles.includes("hr"),
        isOperations: isSuperAdmin || roles.includes("operations"),
        isFinance: isSuperAdmin || roles.includes("finance"),
        isLegal: isSuperAdmin || roles.includes("legal"),
        accessBlocked,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
