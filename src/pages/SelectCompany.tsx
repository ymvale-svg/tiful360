import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Building2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CompanyOption {
  id: string;
  name: string;
  logo_url: string | null;
}

// Returns the appropriate landing path for the user's primary role.
function getDefaultRoute(opts: {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isPayroll: boolean;
  isOperations: boolean;
  isIT: boolean;
  isDirectManager: boolean;
  isEmployee: boolean;
}): string {
  if (opts.isSuperAdmin || opts.isAdmin) return "/";
  if (opts.isPayroll) return "/leave-requests";
  if (opts.isOperations) return "/employees";
  if (opts.isIT) return "/it-tickets";
  if (opts.isDirectManager) return "/leave-requests";
  if (opts.isEmployee) return "/portal";
  return "/portal";
}

export default function SelectCompany() {
  const auth = useAuth();
  const { user, loading: authLoading, isSuperAdmin } = auth;
  const { setActiveCompanyId } = useCompany();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultRoute = getDefaultRoute(auth);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchCompanies = async () => {
      try {
        if (isSuperAdmin) {
          const { data } = await supabase
            .from("companies")
            .select("id, name, logo_url")
            .order("name");
          setCompanies(data ?? []);
        } else {
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
    };

    fetchCompanies();
  }, [user, authLoading, isSuperAdmin, navigate]);

  // Auto-redirect if only one company
  useEffect(() => {
    if (!loading && companies.length === 1) {
      setActiveCompanyId(companies[0].id);
      navigate(defaultRoute);
    }
  }, [loading, companies, setActiveCompanyId, navigate, defaultRoute]);

  // Still loading or auto-redirecting
  if (authLoading || loading || companies.length === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // No companies
  if (companies.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-bold mb-2">אין חברות משויכות</h1>
          <p className="text-muted-foreground text-sm">
            המשתמש שלך עדיין לא שויך לאף חברה. פנה למנהל המערכת.
          </p>
        </div>
      </div>
    );
  }

  // Multiple companies — show picker
  const handleSelect = (companyId: string) => {
    setActiveCompanyId(companyId);
    navigate(defaultRoute);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">בחר חברה</h1>
          <p className="text-sm text-muted-foreground mt-1">בחר את החברה שברצונך לנהל</p>
        </div>

        <div className="grid gap-3">
          {companies.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              className="w-full justify-start gap-4 py-6 px-5 text-right"
              onClick={() => handleSelect(c.id)}
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {c.logo_url ? (
                  <img src={c.logo_url} alt={c.name} className="w-8 h-8 rounded object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <span className="text-base font-medium">{c.name}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
