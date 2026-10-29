import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { hasDualAccess } from "@/lib/dualAccess";
import { landingRoute, opsHomeRoute, setStoredExperience } from "@/lib/landingRoute";
import { SplashScreen } from "@/components/SplashScreen";

export default function SelectExperience() {
  const { loading, roles } = useAuth();
  const navigate = useNavigate();

  // If the user is not dual-role, route them to their natural home.
  useEffect(() => {
    if (loading) return;
    if (!hasDualAccess(roles)) {
      navigate(landingRoute(roles), { replace: true });
    }
  }, [loading, roles, navigate]);

  if (loading) {
    return <SplashScreen />;
  }

  const goOps = () => {
    setStoredExperience("ops");
    navigate(opsHomeRoute(roles), { replace: true });
  };

  const goPortal = () => {
    setStoredExperience("portal");
    navigate("/portal", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">בחר תצוגה</h1>
          <p className="text-sm text-muted-foreground mt-1">
            יש לך גישה גם לממשק הניהולי וגם לפורטל העובדים
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={goOps}
            className="group bg-card rounded-2xl border border-border shadow-card p-6 text-right hover:border-primary hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <LayoutDashboard className="w-7 h-7 text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold mb-1">תפעול 360</h2>
            <p className="text-sm text-muted-foreground">
              ניהול עובדים, ציוד, נוכחות, שכר ועוד
            </p>
          </button>

          <button
            type="button"
            onClick={goPortal}
            className="group bg-card rounded-2xl border border-border shadow-card p-6 text-right hover:border-primary hover:shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <UserRound className="w-7 h-7 text-primary" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold mb-1">פורטל עובדים</h2>
            <p className="text-sm text-muted-foreground">
              הציוד שלי, נוכחות, חופשות, תלושי שכר
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
