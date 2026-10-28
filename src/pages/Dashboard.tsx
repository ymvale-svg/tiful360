import { useState } from "react";
import {
  UserMinus, Clock, SlidersHorizontal, OctagonAlert, AlertTriangle, Info,
} from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { useDashboardStats, useAlerts, useEmployees, useActivityLog } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { ExpiringAssetsCard } from "@/components/ExpiringAssetsCard";
import { LeaveStatusCard } from "@/components/dashboard/LeaveStatusCard";
import { OnboardingCard } from "@/components/dashboard/OnboardingCard";
import { OpenTicketsCard } from "@/components/dashboard/OpenTicketsCard";
import { PendingSignaturesCard } from "@/components/dashboard/PendingSignaturesCard";
import { AttendanceMissingCard } from "@/components/dashboard/AttendanceMissingCard";
import { Tax101StatusCard } from "@/components/dashboard/Tax101StatusCard";
import { CustomizeDashboardDialog } from "@/components/dashboard/CustomizeDashboardDialog";
import { hasDualAccess } from "@/lib/dualAccess";
import { resolveDashboardConfig, type KpiKey, type WidgetKey } from "@/lib/dashboardConfig";
import { useDashboardPrefs, applyWidgetOrder } from "@/hooks/useDashboardPrefs";
import { cn } from "@/lib/utils";
import { KpiTile } from "@/components/ui/kpi-tile";
import { ListSkeleton } from "@/components/feedback/StateView";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationCenter } from "@/lib/notificationCenter";

export default function Dashboard() {
  const { roles, loading, user } = useAuth();
  const { data: stats } = useDashboardStats();
  const { data: alerts } = useAlerts();
  const { data: employees } = useEmployees();
  const { data: activityLog } = useActivityLog();
  const { prefs, toggleHidden, toggleWide, setOrder, reset, isCustomized } = useDashboardPrefs(user?.id);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Wait for roles to load before rendering — prevents flash of admin UI
  // for employee-only users before the redirect kicks in.
  if (loading || roles.length === 0) {
    return (
      <div className="space-y-6" role="status" aria-busy="true">
        <span className="sr-only">טוען את לוח הבקרה…</span>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <ListSkeleton rows={5} className="rounded-xl border border-border/50 bg-card" />
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
  const orderedWidgets = applyWidgetOrder(config.widgets, prefs.order);
  const visibleWidgets = orderedWidgets.filter((w) => !prefs.hidden.includes(w));
  const wideWidgets = visibleWidgets.filter((w) => prefs.wide.includes(w));
  const normalWidgets = visibleWidgets.filter((w) => !prefs.wide.includes(w));
  const showActivity = normalWidgets.includes("activity");
  const sidebarWidgets = normalWidgets.filter((w) => w !== "activity");

  const leavingEmployees = employees?.filter(e => e.status === "leaving") ?? [];

  // Every number leads to the list behind it. Open alerts open the notification center, which
  // every dashboard role can use (the /alerts page is admin and IT only).
  const KPI_DEFS: Record<KpiKey, { label: string; value?: number; href?: string; linkLabel?: string; onOpen?: () => void }> = {
    activeEmployees: { label: "עובדים פעילים", value: stats?.activeEmployees, href: "/employees" },
    onboardingEmployees: { label: "עובדים בקליטה", value: stats?.onboardingEmployees, href: "/onboarding" },
    totalAssets: { label: "פריטי ציוד", value: stats?.totalAssets, href: "/assets" },
    openAlerts: { label: "התראות פתוחות", value: stats?.openAlerts, onOpen: () => notificationCenter.set(true), linkLabel: "לפתיחת ההתראות" },
    openTickets: { label: "קריאות שירות פתוחות", value: stats?.openTickets, href: "/it-tickets" },
  };

  const statCards = config.kpis.map((k) => ({ key: k, ...KPI_DEFS[k] }));
  const expiryDomains = config.expiryDomains === "all" ? undefined : config.expiryDomains ?? undefined;

  const activityWidget = (
    <div className="bg-card rounded-xl border border-border/50 shadow-card h-full">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold">פעילות אחרונה</h2>
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
            <time dateTime={item.created_at} className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
              {new Date(item.created_at).toLocaleDateString("he-IL")}
            </time>
          </div>
        ))}
        {(!activityLog || activityLog.length === 0) && (
          <div className="p-8 text-center text-sm">
            <p className="font-medium">אין פעילות עדיין</p>
            <p className="text-muted-foreground mt-1">שיוכים, קליטות ועזיבות יופיעו כאן.</p>
          </div>
        )}
      </div>
    </div>
  );

  const SEVERITY = {
    critical: { label: "קריטי", icon: OctagonAlert, cls: "bg-destructive/10 text-destructive" },
    warning: { label: "אזהרה", icon: AlertTriangle, cls: "bg-warning/15 text-warning" },
    info: { label: "מידע", icon: Info, cls: "bg-info/10 text-info" },
  } as const;

  const alertsWidget = (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold">התראות קרובות</h2>
        <button type="button" onClick={() => notificationCenter.set(true)} className="min-h-8 text-xs font-medium text-primary hover:underline">
          לכל ההתראות
        </button>
      </div>
      <ul className="divide-y divide-border/50">
        {(alerts ?? []).slice(0, 4).map((alert) => {
          const sev = SEVERITY[alert.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
          return (
            <li key={alert.id} className="p-4 flex items-center gap-3">
              <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold", sev.cls)}>
                <sev.icon className="h-3 w-3" aria-hidden="true" />{sev.label}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{alert.title}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {alert.target_date ? new Date(alert.target_date).toLocaleDateString("he-IL") : "ללא תאריך יעד"}
                </p>
              </div>
            </li>
          );
        })}
        {(!alerts || alerts.length === 0) && (
          <li className="p-6 text-center text-sm">
            <p className="font-medium">אין התראות פתוחות</p>
            <p className="text-muted-foreground mt-1">תפוגות וציוד ללא שיוך יופיעו כאן.</p>
          </li>
        )}
      </ul>
    </div>
  );

  const leavingWidget = leavingEmployees.length > 0 ? (
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
  ) : null;

  const renderWidget = (key: WidgetKey) => {
    switch (key) {
      case "expiring": return <ExpiringAssetsCard key={key} domains={expiryDomains} />;
      case "activity": return <div key={key}>{activityWidget}</div>;
      case "openTickets": return <OpenTicketsCard key={key} />;
      case "pendingSignatures": return <PendingSignaturesCard key={key} />;
      case "onboarding": return <OnboardingCard key={key} />;
      case "attendanceMissing": return <AttendanceMissingCard key={key} />;
      case "tax101": return <Tax101StatusCard key={key} />;
      case "leave": return <LeaveStatusCard key={key} />;
      case "alerts": return <div key={key}>{alertsWidget}</div>;
      case "leaving": return leavingWidget ? <div key={key}>{leavingWidget}</div> : null;
      default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">לוח בקרה</h1>
          <p className="page-subtitle">סקירה כללית של משאבי החברה</p>
        </div>
        <button
          onClick={() => setCustomizeOpen(true)}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border/60",
            "bg-card hover:bg-muted/50 transition-colors shrink-0",
            isCustomized && "border-primary/40 text-primary",
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          התאמה אישית
        </button>
      </div>

      {/* KPI tiles: the number, and a link to the list behind it */}
      {statCards.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-4">
          {statCards.map((stat) => (
            <KpiTile
              key={stat.key}
              label={stat.label}
              value={stat.value}
              loading={!stats}
              format={(n) => Math.round(n).toLocaleString("he-IL")}
              href={stat.href}
              action={stat.onOpen ? (
                <button type="button" onClick={stat.onOpen} className="-mt-1 self-start rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {stat.linkLabel} ←
                </button>
              ) : undefined}
              className={cn(stat.value === 0 && "[&_[data-slot=kpi-value]]:text-muted-foreground/70")}
            />
          ))}
        </div>
      )}

      {/* Wide widgets — user-enlarged, rendered full width */}
      {wideWidgets.map(renderWidget)}

      {/* Regular layout: activity takes the main column, the rest stack in the sidebar */}
      {showActivity && (
        <div className={`grid grid-cols-1 gap-6 ${sidebarWidgets.length > 0 ? "lg:grid-cols-3" : ""}`}>
          <div className={sidebarWidgets.length > 0 ? "lg:col-span-2" : ""}>{activityWidget}</div>
          {sidebarWidgets.length > 0 && (
            <div className="space-y-6">{sidebarWidgets.map(renderWidget)}</div>
          )}
        </div>
      )}
      {!showActivity && sidebarWidgets.length > 0 && (
        // Two independent columns (not a row grid) so a tall card never
        // leaves an empty gap under the short card beside it.
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {[0, 1].map((col) => (
            <div key={col} className="space-y-6">
              {sidebarWidgets.filter((_, i) => i % 2 === col).map(renderWidget)}
            </div>
          ))}
        </div>
      )}

      <CustomizeDashboardDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        widgets={orderedWidgets}
        prefs={prefs}
        onToggleHidden={toggleHidden}
        onToggleWide={toggleWide}
        onSetOrder={setOrder}
        onReset={reset}
      />
    </div>
  );
}
