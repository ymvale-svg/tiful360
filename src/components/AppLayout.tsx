import { Suspense, useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { CompanySelector } from "./CompanySelector";
import { Bell, Search, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
import { hasDualAccess } from "@/lib/dualAccess";

export function AppLayout() {
  const { user, signOut, isSuperAdmin, roles } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [headerSearch, setHeaderSearch] = useState(searchParams.get("q") ?? "");

  // Keep header input in sync when route/url changes
  useEffect(() => {
    setHeaderSearch(searchParams.get("q") ?? "");
  }, [location.pathname, searchParams]);

  const supportsSearch = ["/assets", "/employees"].some((p) => location.pathname.startsWith(p));

  const onHeaderSearchChange = (val: string) => {
    setHeaderSearch(val);
    if (!supportsSearch) {
      // Jump to assets search when typing from elsewhere
      if (val.trim().length >= 2) navigate(`/assets?q=${encodeURIComponent(val)}`);
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (val) next.set("q", val);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const initials = profile?.display_name
    ? profile.display_name.split(" ").map(w => w[0]).join("").slice(0, 2)
    : user?.email?.slice(0, 2) ?? "??";

  const roleLabel = isSuperAdmin ? "סופר אדמין" : profile?.system_role === 'admin' ? 'מנהל מערכת' : profile?.system_role === 'it' ? 'צוות IT' : 'עובד';

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      
      <div className="mr-[240px] min-h-screen">
        <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-muted rounded-lg px-3 py-2 w-80">
              <Search className="w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={headerSearch}
                onChange={(e) => onHeaderSearchChange(e.target.value)}
                placeholder="חיפוש עובדים, ציוד, משימות..."
                className="bg-transparent text-sm outline-none w-full placeholder:text-muted-foreground"
              />
            </div>
            <CompanySelector />
          </div>

          <div className="flex items-center gap-4">
            {hasDualAccess(roles) && (
              <button
                onClick={() => {
                  sessionStorage.setItem("activeExperience", "portal");
                  navigate("/portal");
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-muted/70 transition-colors"
                title="מעבר לפורטל עובדים"
              >
                <UserRound className="w-4 h-4" />
                <span className="hidden sm:inline">פורטל עובדים</span>
              </button>
            )}
            <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-destructive rounded-full animate-pulse-dot" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <span className="text-xs font-bold text-primary-foreground">{initials}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{profile?.display_name || user?.email}</p>
                <p className="text-[11px] text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="יציאה"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="p-6">
          <Suspense fallback={
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
