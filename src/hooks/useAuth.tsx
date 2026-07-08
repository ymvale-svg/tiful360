import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "it_manager" | "employee" | "super_admin" | "direct_manager" | "payroll" | "hr" | "operations" | "finance" | "legal";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: AppRole[];
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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  roles: [],
  hasRole: () => false,
  isAdmin: false,
  isIT: false,
  isEmployee: false,
  isSuperAdmin: false,
  isDirectManager: false,
  isPayroll: false,
  isOperations: false,
  isFinance: false,
  isLegal: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setTimeout(() => fetchRoles(session.user.id), 0);
      } else {
        setRoles([]);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchRoles]);

  const hasRole = useCallback((role: AppRole) => roles.includes(role) || roles.includes("super_admin"), [roles]);
  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
  };

  const isSuperAdmin = roles.includes("super_admin");

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        roles,
        hasRole,
        isAdmin: isSuperAdmin || roles.includes("admin"),
        isIT: isSuperAdmin || roles.includes("it_manager"),
        isEmployee: roles.includes("employee"),
        isSuperAdmin,
        isDirectManager: isSuperAdmin || roles.includes("direct_manager"),
        isPayroll: isSuperAdmin || roles.includes("payroll"),
        isOperations: isSuperAdmin || roles.includes("operations"),
        isFinance: isSuperAdmin || roles.includes("finance"),
        isLegal: isSuperAdmin || roles.includes("legal"),
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
