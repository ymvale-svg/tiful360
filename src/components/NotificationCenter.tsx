// The header's notification center. Its row anatomy, resolve-in-place behaviour and animated tab
// indicator are adapted from "Notification Panel" by uvain on 21st.dev (MIT), reworked for system
// alerts (expiry, unassigned equipment, offboarding) instead of collaboration events.
import { EMPTY_ICONS } from "@/components/feedback/emptyIcons";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, Info, OctagonAlert, Package, User } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StateView } from "@/components/feedback/StateView";
import { useAlerts } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { useAssetCategories } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { domainKeyToSlug, getDomain } from "@/lib/assetDomains";
import { daysUntil, groupAlerts, relativeDay } from "@/lib/alertGroups";
import { notificationCenter } from "@/lib/notificationCenter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Alert = NonNullable<ReturnType<typeof useAlerts>["data"]>[number];
type Tab = "all" | "critical" | "warning" | "info";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "הכל" },
  { id: "critical", label: "קריטיות" },
  { id: "warning", label: "אזהרות" },
  { id: "info", label: "מידע" },
];

const SEVERITY = {
  critical: { label: "קריטי", icon: OctagonAlert, chip: "bg-destructive/10 text-destructive", bar: "bg-destructive" },
  warning: { label: "אזהרה", icon: AlertTriangle, chip: "bg-warning/15 text-warning", bar: "bg-warning" },
  info: { label: "מידע", icon: Info, chip: "bg-info/10 text-info", bar: "bg-info" },
} as const;

const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;

/** Bell button for the header. Shows a count only when something is open. */
export function NotificationBell() {
  const { data: alerts } = useAlerts();
  const count = alerts?.length ?? 0;
  return (
    <>
      <button
        type="button"
        onClick={() => notificationCenter.set(true)}
        className="relative grid h-10 w-10 place-items-center rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        aria-label={count ? `התראות: ${count} פתוחות` : "התראות: אין התראות פתוחות"}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        {count > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -left-0.5 min-w-5 h-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-bold leading-5 text-center tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      <NotificationCenter />
    </>
  );
}

function NotificationCenter() {
  const open = useSyncExternalStore(notificationCenter.subscribe, notificationCenter.get);
  const { data: alerts, isLoading, error, refetch } = useAlerts();
  const { data: categories } = useAssetCategories();
  const { roles, isSuperAdmin } = useAuth();
  const canResolve = roles.includes("admin");
  const canSeeAlertsPage = isSuperAdmin || roles.some((r) => r === "admin" || r === "it_manager");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>("all");
  /** Alerts handled while the panel is open stay visible as a quiet line, so you can see what you did. */
  const [handled, setHandled] = useState<Record<string, true>>({});

  const setOpen = (next: boolean) => {
    notificationCenter.set(next);
    if (!next && Object.keys(handled).length) {
      setHandled({});
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
  };

  const resolve = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error: e } = await supabase.from("alerts")
        .update({ is_resolved: resolved, resolved_at: resolved ? new Date().toISOString() : null })
        .eq("id", id);
      if (e) throw e;
    },
    onError: () => toast.error("לא הצלחנו לעדכן את ההתראה. נסו שוב."),
  });

  const markHandled = (a: Alert) => {
    setHandled((h) => ({ ...h, [a.id]: true }));
    resolve.mutate({ id: a.id, resolved: true }, {
      onError: () => setHandled((h) => { const n = { ...h }; delete n[a.id]; return n; }),
    });
  };
  const undo = (a: Alert) => {
    setHandled((h) => { const n = { ...h }; delete n[a.id]; return n; });
    resolve.mutate({ id: a.id, resolved: false });
  };

  const openTarget = async (a: Alert) => {
    let href: string | null = null;
    if (a.related_asset_id) {
      const { data } = await supabase.from("assets").select("category_id").eq("id", a.related_asset_id).maybeSingle();
      const cat = categories?.find((c) => c.id === data?.category_id);
      href = `/assets/${domainKeyToSlug(getDomain(cat ?? null))}/${a.related_asset_id}`;
    } else if (a.related_employee_id) {
      href = `/employees/${a.related_employee_id}`;
    }
    if (!href) return;
    setOpen(false);
    navigate(href);
  };

  const list = useMemo(() => alerts ?? [], [alerts]);
  const counts = useMemo(() => ({
    all: list.length,
    critical: list.filter((a) => a.severity === "critical").length,
    warning: list.filter((a) => a.severity === "warning").length,
    info: list.filter((a) => a.severity === "info").length,
  }), [list]);
  const groups = useMemo(
    () => groupAlerts(tab === "all" ? list : list.filter((a) => a.severity === tab)),
    [list, tab],
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" dir="rtl" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="space-y-0.5 border-b border-border px-5 pb-3 pt-5 text-right">
          <SheetTitle className="text-lg">התראות</SheetTitle>
          <SheetDescription>
            {counts.all ? `${counts.all} פתוחות${counts.critical ? `, מתוכן ${counts.critical} קריטיות` : ""}` : "אין התראות פתוחות"}
          </SheetDescription>
        </SheetHeader>

        <div role="tablist" aria-label="סינון לפי חומרה" className="flex gap-1 overflow-x-auto border-b border-border px-3">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex min-h-11 shrink-0 items-center gap-1.5 px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {counts[t.id] > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{counts[t.id]}</span>
                )}
                {active && (
                  <motion.span
                    layoutId="notification-tab"
                    transition={reduced ? { duration: 0 } : SPRING}
                    className="absolute inset-x-1.5 -bottom-px h-[3px] rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <StateView
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            label="התראות"
            isEmpty={groups.length === 0}
            empty={{
              title: tab === "all" ? "אין התראות פתוחות" : "אין התראות בחומרה הזו",
              description: "תפוגות, ציוד ללא שיוך ועובדים בתהליך עזיבה יופיעו כאן.",
              icons: EMPTY_ICONS.alerts,
            }}
          >
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`alerts-${g.key}`}>
                <h3 id={`alerts-${g.key}`} className="sticky top-0 z-10 bg-background/95 px-5 py-2 text-xs font-semibold text-muted-foreground backdrop-blur">
                  {g.label}
                </h3>
                <ul className="divide-y divide-border/60">
                  <AnimatePresence initial={false}>
                    {g.items.map((a) => {
                      const sev = SEVERITY[a.severity as keyof typeof SEVERITY] ?? SEVERITY.info;
                      const SevIcon = sev.icon;
                      const KindIcon = a.related_asset_id ? Package : a.related_employee_id ? User : Bell;
                      const days = a.target_date ? daysUntil(a.target_date) : null;
                      const isHandled = !!handled[a.id];
                      const hasTarget = !!(a.related_asset_id || a.related_employee_id);
                      return (
                        <motion.li
                          key={a.id}
                          layout={!reduced}
                          initial={false}
                          exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
                          transition={SPRING}
                          className={cn("relative flex gap-3 px-5 py-3.5", isHandled && "bg-muted/40")}
                        >
                          <span aria-hidden="true" className={cn("absolute inset-y-2 right-0 w-[3px] rounded-l", isHandled ? "bg-success" : sev.bar)} />
                          <span aria-hidden="true" className="relative mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                            <KindIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm leading-snug", isHandled ? "text-muted-foreground line-through decoration-muted-foreground/40" : "font-medium")}>
                              {a.title}
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-px font-semibold", sev.chip)}>
                                <SevIcon className="h-3 w-3" aria-hidden="true" />{sev.label}
                              </span>
                              {a.category && <span>{a.category}</span>}
                              {days !== null && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className={cn(days < 0 && !isHandled && "font-medium text-destructive")}>{relativeDay(days)}</span>
                                </>
                              )}
                            </p>
                            {isHandled ? (
                              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                                <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                                סומן כטופל
                                <button type="button" onClick={() => undo(a)} className="ms-1 min-h-8 rounded px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  ביטול
                                </button>
                              </p>
                            ) : (hasTarget || canResolve) && (
                              <div className="mt-2.5 flex flex-wrap gap-2">
                                {hasTarget && (
                                  <Button size="sm" variant="outline" onClick={() => openTarget(a)}>פתח</Button>
                                )}
                                {canResolve && (
                                  <Button size="sm" variant="ghost" onClick={() => markHandled(a)}>
                                    <Check aria-hidden="true" /> סמן כטופל
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </StateView>
        </div>

        {canSeeAlertsPage && (
          <div className="border-t border-border px-5 py-3">
            <Link to="/alerts" onClick={() => setOpen(false)} className="text-sm font-medium text-primary hover:underline">
              לכל ההתראות ←
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
