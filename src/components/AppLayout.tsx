import { Suspense, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { CompanySelector } from "./CompanySelector";
import { Bell, LogOut, Menu, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
import { hasDualAccess } from "@/lib/dualAccess";
import { SkipLink } from "./SkipLink";
import { AiAssistantWidget } from "./AiAssistantWidget";
import { useSignedFormAlerts } from "@/hooks/useSignedFormAlerts";
import { GlobalSearch } from "./GlobalSearch";

export function AppLayout() {
  const { user, signOut, isSuperAdmin, roles } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useSignedFormAlerts();


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
      <SkipLink />
      <AppSidebar mobileOpen={mobileMenuOpen} onMobileOpenChange={setMobileMenuOpen} />
      
      <div className="min-h-screen min-w-0 overflow-x-hidden transition-[margin] duration-300" style={{ marginRight: "var(--sidebar-width, 240px)" }}>
        <header role="banner" className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-md border-b border-border flex items-center justify-between px-3 sm:px-6 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="פתיחת תפריט ניווט"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <GlobalSearch />
            <CompanySelector />
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {hasDualAccess(roles) && (
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("activeExperience", "portal");
                  navigate("/portal");
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-muted hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="מעבר לפורטל עובדים"
                title="מעבר לפורטל עובדים"
              >
                <UserRound className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">פורטל עובדים</span>
              </button>
            )}
            <ThemeToggle />
            <button
              type="button"
              className="relative p-2 rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="התראות"
            >
              <Bell className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
              <span className="absolute top-1.5 left-1.5 w-2 h-2 bg-destructive rounded-full animate-pulse-dot" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0" aria-hidden="true">
                <span className="text-xs font-bold text-primary-foreground">{initials}</span>
              </div>
              <div className="text-right hidden sm:block max-w-[140px]">
                <p className="text-sm font-medium truncate">{profile?.display_name || user?.email}</p>
                <p className="text-[11px] text-muted-foreground truncate">{roleLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="יציאה מהמערכת"
              title="יציאה"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="p-3 sm:p-4 lg:p-6 focus:outline-none pb-24 w-full max-w-full overflow-x-hidden">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <AiAssistantWidget />
    </div>
  );
}
