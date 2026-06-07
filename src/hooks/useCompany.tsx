import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  portal_name?: string | null;
  portal_logo_url?: string | null;
  portal_primary_color?: string | null;
}

interface CompanyContextType {
  companies: Company[];
  activeCompanyId: string | null;
  activeCompany: Company | null;
  setActiveCompanyId: (id: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextType>({
  companies: [],
  activeCompanyId: null,
  activeCompany: null,
  setActiveCompanyId: () => {},
  loading: true,
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, roles } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const isSuperAdmin = roles.includes("super_admin");

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    try {
      if (isSuperAdmin) {
        // Super admin sees all companies
        const { data } = await supabase
          .from("companies")
          .select("id, name, logo_url")
          .order("name");
        setCompanies(data ?? []);
      } else {
        // Regular users see only their companies via user_company_access
        const { data } = await supabase
          .from("user_company_access")
          .select("company_id, companies(id, name, logo_url)")
          .eq("user_id", user.id);
        const mapped = (data ?? [])
          .map((d: any) => d.companies)
          .filter(Boolean);
        setCompanies(mapped);
      }
    } catch {
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  useEffect(() => {
    // Auto-select first company if none selected
    if (!activeCompanyId && companies.length > 0) {
      const saved = localStorage.getItem("activeCompanyId");
      if (saved && companies.find((c) => c.id === saved)) {
        setActiveCompanyIdState(saved);
      } else {
        setActiveCompanyIdState(companies[0].id);
      }
    }
  }, [companies, activeCompanyId]);

  const setActiveCompanyId = (id: string) => {
    setActiveCompanyIdState(id);
    localStorage.setItem("activeCompanyId", id);
  };

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompanyId, activeCompany, setActiveCompanyId, loading }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export const useCompany = () => useContext(CompanyContext);
