import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, UserRound, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { hasDualAccess } from "@/lib/dualAccess";

function getOpsRoute(opts: {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isPayroll: boolean;
  isOperations: boolean;
  isIT: boolean;
  isDirectManager: boolean;
}): string {
  if (opts.isSuperAdmin || opts.isAdmin) return "/";
  if (opts.isPayroll) return "/leave-requests";
  if (opts.isOperations) return "/employees";
  if (opts.isIT) return "/it-tickets";
  if (opts.isDirectManager) return "/leave-requests";
  return "/";
}

export default function SelectExperience() {
  const auth = useAuth();
  const { loading, roles } = auth;
  const navigate = useNavigate();

  // If the user is not dual-role, route them to their natural home.
  useEffect(() => {
    if (loading) return;
    if (!hasDualAccess(roles)) {
      if (roles.includes("employee") && roles.length === 1) {
        navigate("/portal", { replace: true });
      } else {
        navigate(getOpsRoute(auth), { replace: true });
      }
    }
  }, [loading, roles, navigate, auth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const goOps = () => {
    sessionStorage.setItem("activeExperience", "ops");
    navigate(getOpsRoute(auth), { replace: true });
  };

  const goPortal = () => {
    sessionStorage.setItem("activeExperience", "portal");
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
            onClick={goOps}
            className="group bg-card rounded-2xl border border-border shadow-card p-6 text-right hover:border-primary hover:shadow-lg transition-all"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <LayoutDashboard className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-1">תפעול 360</h2>
            <p className="text-sm text-muted-foreground">
              ניהול עובדים, ציוד, נוכחות, שכר ועוד
            </p>
          </button>

          <button
            onClick={goPortal}
            className="group bg-card rounded-2xl border border-border shadow-card p-6 text-right hover:border-primary hover:shadow-lg transition-all"
          >
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <UserRound className="w-7 h-7 text-primary" />
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
