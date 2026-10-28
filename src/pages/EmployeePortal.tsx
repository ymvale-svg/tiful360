import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Package, Megaphone, Phone, ExternalLink,
  FileText, CalendarDays, AlertCircle, LogOut, Cake, PartyPopper,
  Box, Wifi, LayoutDashboard, Wrench, Search, X, ArrowRight, ChevronLeft,
  Thermometer, ClockAlert, Plus, UserX, Inbox, CheckCircle2,
} from "lucide-react";
import { MyTicketsTab } from "@/components/portal/MyTicketsTab";
import portalLogo from "@/assets/portal-logo.png.asset.json";
import { hasDualAccess } from "@/lib/dualAccess";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useCompanyContacts } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PendingHandoverForms } from "@/components/PendingHandoverForms";
import { MyProtocolsList } from "@/components/portal/MyProtocolsList";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { AttendanceCorrectionDialog } from "@/components/AttendanceCorrectionDialog";
import { NewPortalTicketDialog } from "@/components/portal/NewPortalTicketDialog";
import { LeaveRequestsList } from "@/components/LeaveRequestsList";
import { useMyLeaveRequests } from "@/hooks/useLeaveRequests";
import { EmployeePayslipsTab } from "@/components/EmployeePayslipsTab";
import { Tax101Banner } from "@/components/portal/Tax101Banner";
import { MyTax101FormsList } from "@/components/portal/MyTax101FormsList";
import { useMyPunches, useCreateRemotePunch } from "@/hooks/useAttendancePunches";
import { useMyPendingTax101 } from "@/hooks/useTax101";
import { MyPunchesList } from "@/components/portal/MyPunchesList";
import { MonthReportConfirm } from "@/components/portal/MonthReportConfirm";
import { useToast } from "@/hooks/use-toast";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { BirthdayPreferenceCard } from "@/components/portal/BirthdayPreferenceCard";
import { processBirthdaysForCurrentMonth } from "@/lib/hebrewBirthday";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PortalLearningLibrary } from "@/components/portal/PortalLearningLibrary";
import { useGuideLibrary, useProcedureLibrary } from "@/hooks/usePortalLearning";
import { PortalTabBar, PORTAL_TABBAR_SPACE } from "@/components/portal/PortalTabBar";
import { PortalClockCard } from "@/components/portal/PortalClockCard";
import { portalLocationParams, resolvePortalLocation, type PortalLocation, type PortalMoreView, type PortalTab } from "@/components/portal/portalTabs";
import { EmptyState, ListSkeleton, StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";

const MORE_VIEW_LABELS: Record<PortalMoreView, string> = {
  contacts: "אנשי קשר",
  assets: "הציוד שלי",
  pay: "שכר ומסמכים",
  news: "הודעות החברה",
};

const TAB_TITLES: Record<PortalTab, string> = {
  home: "בית",
  attendance: "נוכחות",
  requests: "בקשות",
  knowledge: "ידע",
  more: "עוד",
};

/** Shown in place of personal data when the user has no employee card. */
function NotLinked() {
  return (
    <EmptyState
      icon={<UserX className="w-6 h-6" />}
      title="החשבון שלך עדיין לא מקושר לכרטיס עובד"
      description="פנו למנהל המערכת כדי לקשר את המשתמש לכרטיס העובד שלכם."
    />
  );
}

function AnnouncementCard({ item, compact = false }: { item: any; compact?: boolean }) {
  return (
    <article className={cn(compact ? "bg-muted/50 rounded-lg p-3" : "bg-card rounded-xl border border-border/50 p-4")}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className={cn("text-sm", compact ? "font-medium" : "font-semibold")}>{item.title}</h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(item.published_at).toLocaleDateString("en-GB")}
        </span>
      </div>
      <p className={cn("text-muted-foreground whitespace-pre-line", compact ? "text-xs" : "text-sm")}>{item.content}</p>
      {item.sender_name && (
        <p className="mt-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
          בברכה, {item.sender_name}
          {item.sender_role ? ` · ${item.sender_role}` : ""}
        </p>
      )}
    </article>
  );
}

export default function EmployeePortal() {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveType, setLeaveType] = useState<"vacation" | "sick">("vacation");
  const [ticketOpen, setTicketOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [punchingDir, setPunchingDir] = useState<"in" | "out" | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const loc = resolvePortalLocation(searchParams);
  const { user, signOut, roles } = useAuth();
  const { data: profile } = useProfile();
  const { activeCompanyId, activeCompany, loading: companyLoading } = useCompany();
  const portalName = (activeCompany?.portal_name && activeCompany.portal_name.trim())
    || (activeCompany?.name?.includes("אשל הירדן") ? "אשל שלי" : "פורטל עובדים");
  const portalLogoSrc = activeCompany?.portal_logo_url || portalLogo.url;
  const navigate = useNavigate();
  const createPunch = useCreateRemotePunch();
  const confirm = useConfirm();

  /** Tabs live in the URL with push history, so the phone's Back button returns to the previous tab. */
  const go = (next: Partial<PortalLocation> & { tab: PortalTab }) => {
    setSearchParams(portalLocationParams(searchParams, next));
    window.scrollTo({ top: 0 });
  };

  // Normalise old/unknown params (legacy tile ids, ?correction=open from old emails) without adding history.
  useEffect(() => {
    const canonical = portalLocationParams(searchParams, loc);
    if (canonical.toString() !== searchParams.toString()) setSearchParams(canonical, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Pre-warm GPS while the portal is open so a punch can use a fresh reading instantly.
  const warmPosRef = useRef<GeolocationPosition | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    let id: number | null = null;
    try {
      id = navigator.geolocation.watchPosition(
        (pos) => {
          const prev = warmPosRef.current;
          const prevFresh = prev && Date.now() - prev.timestamp < 60000;
          if (!prevFresh || pos.coords.accuracy <= (prev?.coords.accuracy ?? Infinity)) {
            warmPosRef.current = pos;
          }
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 },
      );
    } catch { /* ignore */ }
    return () => { if (id !== null) navigator.geolocation.clearWatch(id); };
  }, []);
  const { toast } = useToast();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "עובד";

  // Find employee record linked to current user
  const employeeQuery = useQuery({
    queryKey: ["my_employee", activeCompanyId, user?.id],
    queryFn: async () => {
      if (!activeCompanyId || !user?.id) return null;
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("linked_user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId && !!user?.id,
  });
  const myEmployee = employeeQuery.data;
  // While the company or the employee card loads, never claim "not linked" or "no equipment".
  const employeeLoading = companyLoading || employeeQuery.isLoading;

  // Prefixes considered "digital" (shown in הרשאות ומערכות section instead of ציוד פיזי)
  const DIGITAL_PREFIXES = ["DACC", "SFT"];

  // Fetch assets assigned to my employee
  const assetsQuery = useQuery({
    queryKey: ["my_assets", myEmployee?.id],
    queryFn: async () => {
      if (!myEmployee?.id) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("*, asset_categories(category_name, icon, prefix)")
        .eq("current_owner_id", myEmployee.id)
        .eq("status", "in_use");
      if (error) throw error;
      // Exclude digital items - they appear in their own section
      return (data ?? []).filter(
        (a: any) => !DIGITAL_PREFIXES.includes(a.asset_categories?.prefix ?? "")
      );
    },
    enabled: !!myEmployee?.id,
  });
  const myAssets = assetsQuery.data ?? [];

  // Fetch digital access for my employee (DACC + SFT categories)
  const digitalQuery = useQuery({
    queryKey: ["my_digital_access", myEmployee?.id],
    queryFn: async () => {
      if (!myEmployee?.id) return [];
      const { data, error } = await supabase
        .from("assets")
        .select("*, asset_categories!inner(category_name, prefix)")
        .eq("current_owner_id", myEmployee.id)
        .in("asset_categories.prefix", DIGITAL_PREFIXES);
      if (error) throw error;
      return (data ?? []).map((a: any) => ({
        id: a.id,
        access_type:
          a.custom_fields?.["סוג גישה"] ??
          a.asset_categories?.category_name ??
          a.asset_name,
        resource_path:
          a.custom_fields?.["נתיב/משאב"] ??
          a.asset_name ??
          a.serial_number ??
          "—",
        permission_level: a.custom_fields?.["רמת הרשאה"] ?? "—",
      }));
    },
    enabled: !!myEmployee?.id,
  });
  const myDigitalAccess = digitalQuery.data ?? [];

  // Fetch attendance punches for my employee (last 30 days)
  const punchesQuery = useMyPunches(myEmployee?.id, 30);
  const myPunches = punchesQuery.data ?? [];
  const qc = useQueryClient();
  useEffect(() => {
    if (!myEmployee?.id) return;
    const ch = supabase
      .channel(`my_punches_${myEmployee.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_punches", filter: `employee_id=eq.${myEmployee.id}` },
        () => qc.invalidateQueries({ queryKey: ["attendance_punches", "mine", myEmployee.id] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [myEmployee?.id, qc]);

  // Fetch portal links from DB
  const { data: portalLinks = [] } = useQuery({
    queryKey: ["portal_links", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("portal_links")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  // Fetch merged company contacts (employees + external) via secure hook
  const contactsQuery = useCompanyContacts();
  const portalContacts = useMemo(() => contactsQuery.data ?? [], [contactsQuery.data]);

  const contactSearchTerms = contactSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredContacts = useMemo(() => {
    if (!contactSearchTerms.length) return portalContacts;
    return portalContacts.filter((c) =>
      contactSearchTerms.every((term) =>
        [c.name, c.role, c.department, c.phone, c.email].some((field) =>
          (field ?? "").toLowerCase().includes(term)
        )
      )
    );
  }, [portalContacts, contactSearchTerms]);

  // Fetch announcements from DB
  const announcementsQuery = useQuery({
    queryKey: ["announcements", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("company_id", activeCompanyId)
        .lte("published_at", nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });
  const announcements = announcementsQuery.data ?? [];

  // Announcements published in the last 3 days are shown "open"; older ones go to the archive
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const freshAnnouncements = announcements.filter(
    (a: any) => new Date(a.published_at).getTime() >= threeDaysAgo
  );
  const archivedAnnouncements = announcements.filter(
    (a: any) => new Date(a.published_at).getTime() < threeDaysAgo
  );

  // Fetch birthday employees this month via secure RPC
  const { data: birthdayEmployees = [] } = useQuery({
    queryKey: ["birthdays", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .rpc("get_company_birthdays", { _company_id: activeCompanyId });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeCompanyId,
  });

  const procedureQuery = useProcedureLibrary(activeCompanyId);
  const guideQuery = useGuideLibrary(activeCompanyId);
  const procedureLibrary = procedureQuery.data ?? { departments: [], items: [] };
  const guideLibrary = guideQuery.data ?? { topics: [], guides: [] };

  const { data: myLeaveRequests = [] } = useMyLeaveRequests(myEmployee?.id);

  // "מחכה לך": the same queries the banners below use (shared cache), to know whether anything waits.
  const { data: pendingTax101 } = useMyPendingTax101(myEmployee?.id, new Date().getFullYear() + 1);
  const { data: pendingHandover = [] } = useQuery({
    queryKey: ["pending-handover", myEmployee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("*")
        .eq("employee_id", myEmployee!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!myEmployee?.id,
  });
  const pendingActions = (pendingTax101 ? 1 : 0) + pendingHandover.length;

  const employeeName = myEmployee?.full_name || displayName;
  const firstName = (employeeName.trim().split(/\s+/).slice(-1)[0]) || employeeName;

  const runPunch = (direction: "in" | "out") => {
    if (!myEmployee) return;
    if (!navigator.geolocation) {
      toast({
        title: "GPS לא נתמך",
        description: "הדפדפן שלך לא תומך בשירותי מיקום",
        variant: "destructive",
      });
      return;
    }
    setPunchingDir(direction);

    let settled = false;
    let watchId: number | null = null;
    let fallbackTimer: number | null = null;
    let hardTimer: number | null = null;
    let bestPos: GeolocationPosition | null = null;

    const finish = async (
      pos: GeolocationPosition | null,
      err?: GeolocationPositionError | { code?: number; message: string },
    ) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      if (hardTimer !== null) window.clearTimeout(hardTimer);

      if (!pos) {
        setPunchingDir(null);
        const code = (err as GeolocationPositionError | undefined)?.code;
        let description =
          "לא ניתן לאתר את המיקום שלך כעת. ודא ש-GPS פעיל ונסה שוב.";
        if (code === 1) {
          description =
            "יש לאפשר גישה למיקום בדפדפן (לחץ על סמל המנעול בכתובת) ולנסות שוב.";
        } else if (code === 3) {
          description =
            "איתור המיקום נמשך זמן רב מדי. צא לאוויר הפתוח או ליד חלון ונסה שוב.";
        } else if (code === 2) {
          description =
            "שירות המיקום אינו זמין כרגע. ודא שה-GPS דלוק במכשיר.";
        }
        toast({ title: "מיקום לא זמין", description, variant: "destructive" });
        return;
      }

      try {
        await createPunch.mutateAsync({
          companyId: myEmployee.company_id!,
          employeeId: myEmployee.id,
          employeeCode: myEmployee.employee_code,
          direction,
          geo: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
        const at = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
        toast({ title: direction === "in" ? `החתמת כניסה נרשמה ב-${at}` : `החתמת יציאה נרשמה ב-${at}` });
      } catch (e: any) {
        toast({ title: "ההחתמה לא נשלחה", description: e.message, variant: "destructive" });
      } finally {
        setPunchingDir(null);
      }
    };

    // Fast path: fresh, reasonably accurate pre-warmed reading → send immediately.
    const warm = warmPosRef.current;
    if (warm && Date.now() - warm.timestamp < 60000 && warm.coords.accuracy <= 150) {
      finish(warm);
      return;
    }
    if (warm && Date.now() - warm.timestamp < 120000) bestPos = warm;

    // High-accuracy stream — accept first reading ≤150m, otherwise keep collecting.
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
            bestPos = pos;
          }
          if (pos.coords.accuracy <= 150) finish(pos);
        },
        (err) => {
          if (err.code === 1) finish(null, err);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
      );
    } catch (e: any) {
      finish(null, { message: e?.message ?? "watch failed" });
      return;
    }

    // After 3s — accept best reading or trigger low-accuracy fallback (Wi-Fi/cell).
    fallbackTimer = window.setTimeout(() => {
      if (bestPos) {
        finish(bestPos);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(pos),
        (err) => {
          if (err.code === 1) finish(null, err);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    }, 3000);

    // Absolute give-up after 15s.
    hardTimer = window.setTimeout(() => {
      if (bestPos) finish(bestPos);
      else finish(null, { code: 3, message: "timeout" } as GeolocationPositionError);
    }, 15000);
  };

  /**
   * Clock-in is one tap. A remote punch can't be reverted by the employee (there is no "delete own
   * punch"), so clock-out — the one people hit by mistake — asks first instead of offering undo.
   */
  const handlePunch = async (direction: "in" | "out") => {
    if (direction === "out") {
      const ok = await confirm({
        title: "להחתים יציאה עכשיו?",
        description: "ההחתמה נרשמת עם השעה והמיקום הנוכחיים. תיקון אחר כך נספר במכסת התיקונים החודשית.",
        confirmLabel: "החתמת יציאה",
        cancelLabel: "לא עכשיו",
      });
      if (!ok) return;
    }
    runPunch(direction);
  };

  const processedBirthdays = processBirthdaysForCurrentMonth(birthdayEmployees as any);
  const balanceUpdated = myEmployee?.balances_updated_at
    ? `עודכן לאחרונה: ${new Date(myEmployee.balances_updated_at).toLocaleDateString("en-GB")} · מקור: ${myEmployee?.balances_source === "payslip" ? "תלוש שכר" : "ידני"}`
    : "היתרות מתעדכנות אוטומטית מתלושי השכר";

  /** Personal content: skeleton while loading, a clear message when unlinked. */
  const withEmployee = (render: (emp: NonNullable<typeof myEmployee>) => React.ReactNode) => {
    if (employeeLoading) return <div role="status" aria-busy="true"><span className="sr-only">טוען…</span><ListSkeleton rows={3} /></div>;
    if (employeeQuery.error) {
      return <StateView error={employeeQuery.error} onRetry={() => { void employeeQuery.refetch(); }} label="את פרטי העובד">{null}</StateView>;
    }
    if (!myEmployee) return <NotLinked />;
    return render(myEmployee);
  };

  const sectionTitle = loc.tab === "more" && loc.view ? MORE_VIEW_LABELS[loc.view] : TAB_TITLES[loc.tab];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <InstallAppBanner aboveTabBar />
      <header role="banner" className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <img src={portalLogoSrc} alt={portalName} className="w-9 h-9 rounded-full object-contain shrink-0 bg-white" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">שלום, {firstName}</p>
            <p className="text-xs text-muted-foreground truncate">
              {myEmployee ? [myEmployee.role, myEmployee.department].filter(Boolean).join(" • ") : portalName}
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main id="main-content" tabIndex={-1} className={cn("max-w-2xl md:max-w-3xl mx-auto px-4 py-4 space-y-4 overflow-x-hidden focus:outline-none", PORTAL_TABBAR_SPACE)}>
        <PortalTabBar active={loc.tab} onSelect={(tab) => go({ tab })} badges={{ home: pendingActions }} />

        <h1 className={cn("text-lg font-bold", loc.tab === "home" && "sr-only")}>{loc.tab === "home" ? `${portalName} — בית` : sectionTitle}</h1>

        {/* ===== HOME ===== */}
        {loc.tab === "home" && (
          <div className="space-y-4 animate-fade-in">
            {employeeLoading ? (
              <ListSkeleton rows={2} className="rounded-2xl border border-border/50" />
            ) : myEmployee ? (
              <PortalClockCard
                punches={myPunches}
                canRemotePunch={!!myEmployee.can_remote_punch}
                punchingDir={punchingDir}
                onPunch={(d) => { void handlePunch(d); }}
                onOpenAttendance={() => go({ tab: "attendance" })}
              />
            ) : null}

            <section aria-labelledby="portal-waiting-title" className="space-y-3">
              <h2 id="portal-waiting-title" className="font-semibold">מחכה לך</h2>
              {myEmployee && <Tax101Banner employee={myEmployee} />}
              {myEmployee && <PendingHandoverForms employeeId={myEmployee.id} />}
              {freshAnnouncements.length > 0 && (
                <div className="bg-card rounded-xl border border-border/50 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Megaphone className="w-4 h-4 text-primary" aria-hidden="true" />
                      הודעות חדשות ({freshAnnouncements.length})
                    </h3>
                    <Button variant="ghost" className="min-h-11 gap-1 text-primary" onClick={() => go({ tab: "more", view: "news" })}>
                      לכל ההודעות <ChevronLeft aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {freshAnnouncements.slice(0, 3).map((ann: any) => <AnnouncementCard key={ann.id} item={ann} compact />)}
                  </div>
                </div>
              )}
              {!employeeLoading && !pendingActions && !freshAnnouncements.length && (
                <p className="flex items-center gap-2 rounded-xl border border-border/50 bg-card p-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" aria-hidden="true" />
                  {myEmployee ? "אין משימות פתוחות — הכל מעודכן." : "אין הודעות חדשות."}
                </p>
              )}
              {!employeeLoading && !myEmployee && !employeeQuery.error && <NotLinked />}
            </section>

            {processedBirthdays.length > 0 && (
              <section aria-labelledby="portal-bdays-title" className="bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200/50 dark:border-amber-800/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cake className="w-4 h-4 text-amber-600" aria-hidden="true" />
                  <h2 id="portal-bdays-title" className="font-semibold text-sm text-amber-800 dark:text-amber-300">ימי הולדת החודש</h2>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {processedBirthdays.map((emp) => {
                    const prefix = emp.isToday ? "היום!" : emp.isTomorrow ? "מחר" : null;
                    const dateText = prefix ? `${prefix} · ${emp.label}` : emp.label;
                    return (
                      <li key={emp.id} className="flex items-center gap-2 bg-white/60 dark:bg-white/10 rounded-lg px-3 py-1.5">
                        <PartyPopper className="w-3.5 h-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-medium">{emp.full_name}</span>
                        <span className="text-xs text-muted-foreground">— {dateText}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {portalLinks.length > 0 && (
              <section aria-label="קישורים מהירים" className="flex flex-wrap gap-2">
                {portalLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 min-h-11 px-3 bg-card border border-border/50 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {link.label}
                  </a>
                ))}
              </section>
            )}
          </div>
        )}

        {/* ===== ATTENDANCE ===== */}
        {loc.tab === "attendance" && (
          <div className="animate-fade-in space-y-3">
            {withEmployee((emp) => (
              <>
                <MonthReportConfirm employeeId={emp.id} />
                <StateView
                  loading={punchesQuery.isLoading}
                  error={punchesQuery.error}
                  onRetry={() => { void punchesQuery.refetch(); }}
                  label="ההחתמות שלך"
                  isEmpty={myPunches.length === 0}
                  empty={{ title: "אין החתמות ב-30 הימים האחרונים", description: "החתמות מהשעון או מהטלפון יופיעו כאן." }}
                >
                  <MyPunchesList
                    punches={myPunches}
                    leaves={(myLeaveRequests as any[]).filter((l) => l.status === "approved")}
                    highlightDate={searchParams.get("highlight") || undefined}
                  />
                </StateView>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  ניתן לתקן שעה ישירות ברשימה עד יום למחרת. בתוך אותו חודש — עד 3 תיקונים נוספים.
                </p>
              </>
            ))}
          </div>
        )}

        {/* ===== REQUESTS ===== */}
        {loc.tab === "requests" && (
          <div className="space-y-4 animate-fade-in">
            {withEmployee((emp) => (
              <>
                <section aria-label="בקשה חדשה" className="grid grid-cols-2 gap-3">
                  {[
                    { label: "חופשה", icon: CalendarDays, onClick: () => { setLeaveType("vacation"); setLeaveOpen(true); } },
                    { label: "דיווח מחלה", icon: Thermometer, onClick: () => { setLeaveType("sick"); setLeaveOpen(true); } },
                    { label: "קריאת שירות", icon: Wrench, onClick: () => setTicketOpen(true) },
                    { label: "תיקון נוכחות", icon: ClockAlert, onClick: () => setCorrectionOpen(true) },
                  ].map((tile) => (
                    <button
                      key={tile.label}
                      type="button"
                      onClick={tile.onClick}
                      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-card p-3 text-sm font-semibold hover:border-primary/40 hover:bg-muted/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [touch-action:manipulation]"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <tile.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" aria-hidden="true" />{tile.label}</span>
                    </button>
                  ))}
                </section>

                <section aria-labelledby="portal-balances-title" className="bg-card rounded-xl border border-border/50 p-4">
                  <h2 id="portal-balances-title" className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" aria-hidden="true" />
                    יתרות חופשה ומחלה
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-2xl font-bold text-primary">
                        {emp.vacation_balance != null ? Number(emp.vacation_balance).toFixed(2) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">ימי חופשה</span>
                    </div>
                    <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-2xl font-bold text-info">
                        {emp.sick_balance != null ? Number(emp.sick_balance).toFixed(2) : "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">ימי מחלה</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">{balanceUpdated}</p>
                </section>

                <section aria-labelledby="portal-my-requests-title" className="space-y-3">
                  <h2 id="portal-my-requests-title" className="font-semibold">הבקשות שלי</h2>
                  <div className="bg-card rounded-xl border border-border/50 p-4">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-primary" aria-hidden="true" />
                      חופשה ומחלה
                    </h3>
                    <LeaveRequestsList requests={myLeaveRequests} allowCancel />
                  </div>
                  <div className="bg-card rounded-xl border border-border/50 p-4">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-primary" aria-hidden="true" />
                      קריאות שירות
                    </h3>
                    <MyTicketsTab employeeId={emp.id} employeeName={emp.full_name} employeePhone={emp.phone} showNewButton={false} />
                  </div>
                </section>
              </>
            ))}
          </div>
        )}

        {/* ===== KNOWLEDGE: procedures + guides ===== */}
        {loc.tab === "knowledge" && (
          <div className="space-y-4 animate-fade-in">
            <div role="group" aria-label="סוג תוכן" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              {([["procedures", "נהלים"], ["guides", "מדריכים"]] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={loc.kind === kind}
                  onClick={() => go({ tab: "knowledge", kind })}
                  className={cn(
                    "min-h-11 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    loc.kind === kind ? "bg-card font-bold text-foreground shadow-sm" : "font-medium text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {loc.kind === "procedures" ? (
              <StateView loading={procedureQuery.isLoading} error={procedureQuery.error} onRetry={() => { void procedureQuery.refetch(); }} label="את הנהלים">
                <PortalLearningLibrary key="procedures" mode="procedures" departments={procedureLibrary.departments} items={procedureLibrary.items} />
              </StateView>
            ) : (
              <StateView loading={guideQuery.isLoading} error={guideQuery.error} onRetry={() => { void guideQuery.refetch(); }} label="את המדריכים">
                <PortalLearningLibrary key="guides" mode="guides" topics={guideLibrary.topics} items={guideLibrary.guides} />
              </StateView>
            )}
          </div>
        )}

        {/* ===== MORE: menu ===== */}
        {loc.tab === "more" && !loc.view && (
          <nav aria-label="עוד" className="animate-fade-in">
            <ul className="divide-y divide-border/60 rounded-xl border border-border/50 bg-card overflow-hidden">
              {([
                { view: "contacts", icon: Phone },
                { view: "assets", icon: Package },
                { view: "pay", icon: FileText },
                { view: "news", icon: Megaphone },
              ] as const).map((item) => (
                <li key={item.view}>
                  <button
                    type="button"
                    onClick={() => go({ tab: "more", view: item.view })}
                    className="flex w-full min-h-14 items-center gap-3 px-4 text-right text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <item.icon className="w-5 h-5 text-primary" aria-hidden="true" />
                    <span className="flex-1">{MORE_VIEW_LABELS[item.view]}</span>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
              {hasDualAccess(roles) && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem("activeExperience", "ops");
                      navigate("/");
                    }}
                    className="flex w-full min-h-14 items-center gap-3 px-4 text-right text-sm font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <LayoutDashboard className="w-5 h-5 text-primary" aria-hidden="true" />
                    <span className="flex-1">מעבר לממשק הניהול</span>
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() => { void handleSignOut(); }}
                  className="flex w-full min-h-14 items-center gap-3 px-4 text-right text-sm font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <LogOut className="w-5 h-5" aria-hidden="true" />
                  <span className="flex-1">יציאה מהמערכת</span>
                </button>
              </li>
            </ul>
          </nav>
        )}

        {loc.tab === "more" && loc.view && (
          <Button variant="ghost" className="min-h-11 -ms-2 gap-1" onClick={() => go({ tab: "more" })}>
            <ArrowRight aria-hidden="true" />
            חזרה לעוד
          </Button>
        )}

        {/* ===== MORE → CONTACTS ===== */}
        {loc.tab === "more" && loc.view === "contacts" && (
          <div className="space-y-3 animate-fade-in">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <input
                type="search"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="חפש לפי שם, תפקיד, מחלקה, טלפון או דוא״ל..."
                className="w-full min-h-11 pr-9 pl-12 py-2.5 bg-card border border-border/50 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
                aria-label="חיפוש אנשי קשר"
              />
              {contactSearch && (
                <button
                  type="button"
                  onClick={() => setContactSearch("")}
                  className="absolute left-0.5 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="נקה חיפוש"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <StateView
              loading={contactsQuery.isLoading}
              error={contactsQuery.error}
              onRetry={() => { void contactsQuery.refetch(); }}
              label="אנשי הקשר"
              isEmpty={filteredContacts.length === 0}
              empty={contactSearch
                ? { title: "לא נמצאו אנשי קשר התואמים לחיפוש", action: <Button variant="outline" onClick={() => setContactSearch("")}>נקה חיפוש</Button> }
                : { title: "אין אנשי קשר כרגע" }}
            >
              <ul className="space-y-2">
                {filteredContacts.map((contact) => (
                  <li key={contact.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
                      <span className="text-sm font-bold text-primary">{contact.name[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{contact.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{[contact.role, contact.department].filter(Boolean).join(" • ")}</p>
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="text-xs text-primary hover:underline truncate block" dir="ltr">
                          {contact.email}
                        </a>
                      )}
                    </div>
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`התקשר אל ${contact.name}: ${contact.phone}`}
                        title={contact.phone}
                      >
                        <Phone className="w-4 h-4" aria-hidden="true" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </StateView>
          </div>
        )}

        {/* ===== MORE → ASSETS ===== */}
        {loc.tab === "more" && loc.view === "assets" && (
          <div className="space-y-4 animate-fade-in">
            {withEmployee((emp) => (
              <>
                <h2 className="font-semibold text-sm">ציוד פיזי{assetsQuery.isSuccess ? ` (${myAssets.length})` : ""}</h2>
                <StateView
                  loading={assetsQuery.isLoading}
                  error={assetsQuery.error}
                  onRetry={() => { void assetsQuery.refetch(); }}
                  label="את הציוד שלך"
                  isEmpty={myAssets.length === 0}
                  empty={{ icon: <Box className="w-6 h-6" />, title: "אין ציוד משויך אליך" }}
                >
                  <ul className="grid grid-cols-1 gap-3">
                    {myAssets.map((asset: any) => (
                      <li key={asset.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Box className="w-5 h-5 text-primary" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.asset_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.asset_code}
                            {asset.serial_number && ` • ${asset.serial_number}`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </StateView>

                <MyProtocolsList employeeId={emp.id} />

                <h2 className="font-semibold text-sm mt-6">הרשאות ומערכות{digitalQuery.isSuccess ? ` (${myDigitalAccess.length})` : ""}</h2>
                <StateView
                  loading={digitalQuery.isLoading}
                  error={digitalQuery.error}
                  onRetry={() => { void digitalQuery.refetch(); }}
                  label="את ההרשאות שלך"
                  isEmpty={myDigitalAccess.length === 0}
                  empty={{ icon: <Wifi className="w-6 h-6" />, title: "אין הרשאות דיגיטליות" }}
                >
                  <ul className="grid grid-cols-1 gap-3">
                    {myDigitalAccess.map((item) => (
                      <li key={item.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Wifi className="w-5 h-5 text-primary" aria-hidden="true" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.resource_path}</p>
                          <p className="text-xs text-muted-foreground">{item.access_type} • {item.permission_level}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </StateView>
              </>
            ))}
          </div>
        )}

        {/* ===== MORE → PAY & DOCUMENTS ===== */}
        {loc.tab === "more" && loc.view === "pay" && (
          <div className="space-y-4 animate-fade-in">
            {withEmployee((emp) => (
              <>
                <section className="bg-card rounded-xl border border-border/50 p-4">
                  <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                    תלושי שכר
                  </h2>
                  <EmployeePayslipsTab employeeId={emp.id} employee={emp} canSeeSalary={true} hideBalances isSelf auditContext="פורטל עובדים — תלושי שכר" />
                </section>
                <section className="bg-card rounded-xl border border-border/50 p-4">
                  <h2 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
                    טפסי 101
                  </h2>
                  <MyTax101FormsList employeeId={emp.id} />
                </section>
                <BirthdayPreferenceCard employee={emp} />
              </>
            ))}
          </div>
        )}

        {/* ===== MORE → NEWS ===== */}
        {loc.tab === "more" && loc.view === "news" && (
          <div className="space-y-3 animate-fade-in">
            <StateView
              loading={announcementsQuery.isLoading}
              error={announcementsQuery.error}
              onRetry={() => { void announcementsQuery.refetch(); }}
              label="את ההודעות"
              isEmpty={announcements.length === 0}
              empty={{ icon: <Inbox className="w-6 h-6" />, title: "אין הודעות כרגע" }}
            >
              {freshAnnouncements.map((item: any) => <AnnouncementCard key={item.id} item={item} />)}
              {archivedAnnouncements.length > 0 && (
                <details className="bg-card rounded-xl border border-border/50">
                  <summary className="cursor-pointer min-h-11 flex items-center p-4 text-sm font-medium text-muted-foreground select-none">
                    ארכיון הודעות ({archivedAnnouncements.length})
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    {archivedAnnouncements.map((item: any) => <AnnouncementCard key={item.id} item={item} compact />)}
                  </div>
                </details>
              )}
            </StateView>
          </div>
        )}
      </main>

      {myEmployee && (
        <>
          <NewLeaveRequestDialog
            open={leaveOpen}
            onOpenChange={setLeaveOpen}
            initialType={leaveType}
            employeeId={myEmployee.id}
            managerId={myEmployee.direct_manager_id ?? null}
          />
          <NewPortalTicketDialog
            open={ticketOpen}
            onOpenChange={setTicketOpen}
            employeeId={myEmployee.id}
            employeeName={myEmployee.full_name}
            employeePhone={myEmployee.phone}
          />
          <AttendanceCorrectionDialog
            open={correctionOpen}
            onClose={() => setCorrectionOpen(false)}
            employeeId={myEmployee.id}
            managerId={myEmployee.direct_manager_id ?? null}
            initiatedBy="employee"
            tracksAttendance={(myEmployee as any).tracks_attendance !== false}
          />
        </>
      )}
    </div>
  );
}
