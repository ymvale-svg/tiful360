import { 
  Users, Package, AlertTriangle, Shield, TrendingUp, 
  UserMinus, Car, Smartphone, Monitor, Clock, Wrench
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useDashboardStats, useAlerts, useEmployees, useActivityLog } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { ExpiringAssetsCard } from "@/components/ExpiringAssetsCard";

export default function Dashboard() {
  const { roles } = useAuth();
  
  // Employee-only users should see the portal, not the dashboard
  const isEmployeeOnly = roles.length > 0 && roles.every(r => r === "employee");
  if (isEmployeeOnly) {
    return <Navigate to="/portal" replace />;
  }
  const { data: stats } = useDashboardStats();
  const { data: alerts } = useAlerts();
  const { data: employees } = useEmployees();
  const { data: activityLog } = useActivityLog();

  const leavingEmployees = employees?.filter(e => e.status === "leaving") ?? [];

  const statCards = [
    { label: "עובדים פעילים", value: stats?.activeEmployees ?? "—", icon: Users, color: "text-primary", bg: "bg-primary/10" },
    { label: "פריטי ציוד", value: stats?.totalAssets ?? "—", icon: Package, color: "text-info", bg: "bg-info/10" },
    { label: "התראות פתוחות", value: stats?.openAlerts ?? "—", icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10" },
    { label: "משימות IT פתוחות", value: stats?.openTickets ?? "—", icon: Shield, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">לוח בקרה</h1>
        <p className="page-subtitle">סקירה כללית של משאבי החברה</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="kpi-number mt-1">{stat.value}</p>
              </div>
              <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expiring assets */}
      <ExpiringAssetsCard />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
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

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Upcoming alerts */}
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

          {/* Leaving employees */}
          {leavingEmployees.length > 0 && (
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
