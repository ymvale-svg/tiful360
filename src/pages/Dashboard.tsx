import { 
  Users, Package, AlertTriangle, Shield, UserPlus,
  UserMinus, Clock
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useDashboardStats, useAlerts, useEmployees, useActivityLog } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { ExpiringAssetsCard } from "@/components/ExpiringAssetsCard";
import { LeaveStatusCard } from "@/components/dashboard/LeaveStatusCard";
import { OnboardingCard } from "@/components/dashboard/OnboardingCard";
import { AttendanceMissingCard } from "@/components/dashboard/AttendanceMissingCard";
import { Tax101StatusCard } from "@/components/dashboard/Tax101StatusCard";
import { hasDualAccess } from "@/lib/dualAccess";
import { resolveDashboardConfig, type KpiKey } from "@/lib/dashboardConfig";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { roles, loading } = useAuth();
  const { data: stats } = useDashboardStats();
  const { data: alerts } = useAlerts();
  const { data: employees } = useEmployees();
  const { data: activityLog } = useActivityLog();

  // Wait for roles to load before rendering — prevents flash of admin UI
  // for employee-only users before the redirect kicks in.
  if (loading || roles.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Employee-only users should see the portal, not the dashboard
  const isEmployeeOnly = roles.every(r => r === "employee");
  if (isEmployeeOnly) {
    return <Navigate to="/portal" replace />;
  }

  // Dual-access users (employee + ops role) should pick an experience first
  // unless they already chose one in this session.
  if (hasDualAccess(roles) && sessionStorage.getItem("activeExperience") !== "ops") {
    return <Navigate to="/select-experience" replace />;
  }

  const config = resolveDashboardConfig(roles);
  const showWidget = (w: string) => config.widgets.includes(w as any);

  const leavingEmployees = employees?.filter(e => e.status === "leaving") ?? [];

  const KPI_DEFS: Record<KpiKey, { label: string; value: number | string; icon: typeof Users; color: string; bg: string }> = {
    activeEmployees: { label: "עובדים פעילים", value: stats?.activeEmployees ?? "—", icon: Users, color: "text-primary", bg: "bg-primary/10" },
    onboardingEmployees: { label: "עובדים בקליטה", value: stats?.onboardingEmployees ?? "—", icon: UserPlus, color: "text-success", bg: "bg-success/10" },
    totalAssets: { label: "פריטי ציוד", value: stats?.totalAssets ?? "—", icon: Package, color: "text-info", bg: "bg-info/10" },
    openAlerts: { label: "התראות פתוחות", value: stats?.openAlerts ?? "—", icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
    openTickets: { label: "משימות IT פתוחות", value: stats?.openTickets ?? "—", icon: Shield, color: "text-destructive", bg: "bg-destructive/10" },
  };

  const statCards = config.kpis.map((k) => ({ key: k, ...KPI_DEFS[k] }));
  const expiryDomains = config.expiryDomains === "all" ? undefined : config.expiryDomains ?? undefined;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">לוח בקרה</h1>
        <p className="page-subtitle">סקירה כללית של משאבי החברה</p>
      </div>

      {/* KPI Cards */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => {
            // A zero has nothing to act on. Keep the card so the grid stays
            // stable, but drop the colour — otherwise "0 התראות פתוחות" shouts
            // as loudly as the counts that actually need attention.
            const isZero = stat.value === 0;
            return (
              <div key={stat.key} className="stat-card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={cn("kpi-number mt-1", isZero && "text-muted-foreground/70")}>
                      {stat.value}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "p-2.5 rounded-lg",
                      isZero ? "bg-muted text-muted-foreground/70" : `${stat.bg} ${stat.color}`,
                    )}
                  >
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Expiring assets — filtered by role domains */}
      {showWidget("expiring") && <ExpiringAssetsCard domains={expiryDomains} />}


      <div className={`grid grid-cols-1 gap-6 ${showWidget("activity") ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {/* Recent Activity */}
        {showWidget("activity") && (
        <div className="lg:col-span-2 bg-card rounded-xl border border-border/50 shadow-card">

          <div className="p-5 border-b border-border/50 flex items-center justify-between">
            <h2 className="font-semibold">פעילות אחרונה</h2>
            <Link to="/employees" className="text-xs text-primary hover:underline">הצג הכל</Link>
          </div>
          <div className="divide-y divide-border/50">
            {(activityLog ?? []).slice(0, 5).map((item) => (
              <div key={item.id} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.action}</p>
                  {item.details && <p className="text-xs text-muted-foreground">{item.details}</p>}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(item.created_at).toLocaleDateString("en-GB")}
                </span>
              </div>
            ))}
            {(!activityLog || activityLog.length === 0) && (
              <div className="p-8 text-center text-muted-foreground text-sm">אין פעילות עדיין</div>
            )}
          </div>
        </div>
        )}

        {/* Sidebar */}
        <div className="space-y-6">
          {showWidget("onboarding") && <OnboardingCard />}

          {showWidget("attendanceMissing") && <AttendanceMissingCard />}

          {showWidget("tax101") && <Tax101StatusCard />}

          {/* Leave requests */}
          {showWidget("leave") && <LeaveStatusCard />}

          {/* Upcoming alerts */}
          {showWidget("alerts") && (
          <div className="bg-card rounded-xl border border-border/50 shadow-card">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <h2 className="font-semibold">התראות קרובות</h2>
              <Link to="/alerts" className="text-xs text-primary hover:underline">הכל</Link>
            </div>

            <div className="divide-y divide-border/50">
              {(alerts ?? []).slice(0, 4).map((alert) => (
                <div key={alert.id} className="p-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    alert.severity === "critical" ? "bg-destructive" :
                    alert.severity === "warning" ? "bg-warning" : "bg-info"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.target_date ? new Date(alert.target_date).toLocaleDateString("en-GB") : "—"}
                    </p>
                  </div>
                </div>
              ))}
              {(!alerts || alerts.length === 0) && (
                <div className="p-6 text-center text-muted-foreground text-sm">אין התראות</div>
              )}
            </div>
          </div>
          )}

          {/* Leaving employees */}
          {showWidget("leaving") && leavingEmployees.length > 0 && (

            <div className="bg-card rounded-xl border border-destructive/20 shadow-card">
              <div className="p-5 border-b border-destructive/20 flex items-center gap-2">
                <UserMinus className="w-4 h-4 text-destructive" />
                <h2 className="font-semibold text-destructive">עובדים בתהליך עזיבה</h2>
              </div>
              <div className="divide-y divide-border/50">
                {leavingEmployees.map((emp) => (
                  <Link key={emp.id} to={`/employees/${emp.id}`} className="block p-4 hover:bg-muted/30 transition-colors">
                    <p className="text-sm font-medium">{emp.full_name}</p>
                    <p className="text-xs text-muted-foreground">{emp.department} • {emp.role}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
