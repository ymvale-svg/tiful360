import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Building2, LogOut, RotateCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { landingRoute } from "@/lib/landingRoute";
import { SplashScreen } from "@/components/SplashScreen";

interface CompanyOption {
  id: string;
  name: string;
  logo_url: string | null;
}

export default function SelectCompany() {
  const { user, loading: authLoading, isSuperAdmin, roles } = useAuth();
  const { setActiveCompanyId } = useCompany();
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  /** A failed load is not "no companies": it gets its own message and a retry. */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => { setLoading(true); setLoadError(null); setAttempt((n) => n + 1); };
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  // No experience picker: phones open the portal, computers the organisation system.
  const defaultRoute = landingRoute(roles);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Right after Google sign-in the session may not have reached the auth
      // context yet; re-check before bouncing to the login screen.
      let cancelled = false;
      const t = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && !data.session) navigate("/login");
      }, 800);
      return () => { cancelled = true; clearTimeout(t); };
    }

    const fetchCompanies = async () => {
      try {
        if (isSuperAdmin) {
          const { data, error } = await supabase
            .from("companies")
            .select("id, name, logo_url")
            .order("name");
          if (error) throw error;
          setCompanies(data ?? []);
        } else {
          const { data, error } = await supabase
            .from("user_company_access")
            .select("company_id, companies(id, name, logo_url)")
            .eq("user_id", user.id);
          if (error) throw error;
          const mapped = (data ?? [])
            .map((d: any) => d.companies)
            .filter(Boolean);
          setCompanies(mapped);
        }
        setLoadError(null);
      } catch (e) {
        setCompanies([]);
        setLoadError(e instanceof Error && e.message ? e.message : "שגיאת רשת");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, [user, authLoading, isSuperAdmin, navigate, attempt]);

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
      <SplashScreen message="טוען את החברות שלך…" />
    );
  }

  // Load failed — not the same as having no companies
  if (loadError) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div role="alert" className="text-center max-w-md">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-xl font-bold mb-2">לא הצלחנו לטעון את החברות שלך</h1>
          <p className="text-muted-foreground text-sm">בדקו את החיבור לאינטרנט ונסו שוב.</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button className="min-h-11 gap-2" onClick={retry}><RotateCw className="w-4 h-4" aria-hidden="true" />נסה שוב</Button>
            <Button variant="outline" className="min-h-11 gap-2" onClick={signOut}><LogOut className="w-4 h-4" aria-hidden="true" />יציאה</Button>
          </div>
        </div>
      </main>
    );
  }

  // No companies
  if (companies.length === 0) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
          <h1 className="text-xl font-bold mb-2">אין חברות משויכות</h1>
          <p className="text-muted-foreground text-sm">
            המשתמש שלך עדיין לא שויך לאף חברה. פנה למנהל המערכת.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline" className="min-h-11 gap-2" onClick={retry}><RotateCw className="w-4 h-4" aria-hidden="true" />בדוק שוב</Button>
            <Button variant="outline" className="min-h-11 gap-2" onClick={signOut}><LogOut className="w-4 h-4" aria-hidden="true" />יציאה והתחברות בחשבון אחר</Button>
          </div>
        </div>
      </main>
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
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4" aria-hidden="true">
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
                  <img src={c.logo_url} alt="" className="w-8 h-8 rounded object-cover" />
                ) : (
                  <Building2 className="w-5 h-5 text-primary" aria-hidden="true" />
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
