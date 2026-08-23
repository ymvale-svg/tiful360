import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

type AppRole = "admin" | "it_manager" | "employee" | "super_admin" | "direct_manager" | "payroll" | "hr" | "operations" | "finance" | "legal" | "secretariat" | "ceo";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { session, loading, roles, accessBlocked, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (accessBlocked) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">הגישה למערכת נחסמה</h1>
          <p className="text-sm text-muted-foreground">
            תהליך העזיבה שלך הושלם ותאריך סיום ההעסקה חלף, ולכן הגישה למערכת תפעול 360 נחסמה.
            לבירורים נא לפנות למשאבי אנוש.
          </p>
          <button
            onClick={signOut}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
          >
            התנתקות
          </button>
        </div>
      </div>
    );
  }


  // If specific roles required, check access
  if (requiredRoles && requiredRoles.length > 0) {
    if (roles.length === 0) {
      // Roles still loading — render nothing (shell stays visible, avoids flash)
      return null;
    }
    const isSuperAdmin = roles.includes("super_admin");
    const hasAccess = isSuperAdmin || requiredRoles.some((r) => roles.includes(r));
    if (!hasAccess) {
      return <Navigate to="/portal" replace />;
    }
  }

  return <>{children}</>;
}
