import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  Package, Clock, Megaphone, BookOpen, Phone, ExternalLink,
  FileText, CalendarDays, AlertCircle, LogOut, Cake, PartyPopper,
  Box, Wifi, LayoutDashboard
} from "lucide-react";
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
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { LeaveRequestsList } from "@/components/LeaveRequestsList";
import { AttendanceCorrectionDialog } from "@/components/AttendanceCorrectionDialog";
import { useMyLeaveRequests } from "@/hooks/useLeaveRequests";
import { useMyAttendanceCorrections } from "@/hooks/useAttendanceCorrections";
import { EmployeePayslipsTab } from "@/components/EmployeePayslipsTab";
import { Tax101Banner } from "@/components/portal/Tax101Banner";
import { MyTax101FormsList } from "@/components/portal/MyTax101FormsList";
import { useMyPunches, useCreateRemotePunch, useEditOwnPunchTime, useMySelfEditCount } from "@/hooks/useAttendancePunches";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { BirthdayPreferenceCard } from "@/components/portal/BirthdayPreferenceCard";
import { WelcomeDateTime } from "@/components/portal/WelcomeDateTime";
import { processBirthdaysForCurrentMonth } from "@/lib/hebrewBirthday";

const portalTabs = [
  { id: "assets", label: "הציוד שלי", icon: Package },
  { id: "attendance", label: "נוכחות", icon: Clock },
  { id: "hr", label: "שכר וחופשות", icon: FileText },
  { id: "news", label: "הודעות", icon: Megaphone },
  { id: "kb", label: "נהלים", icon: BookOpen },
  { id: "contacts", label: "אנשי קשר", icon: Phone },
];

export default function EmployeePortal() {
  const [activeTab, setActiveTab] = useState("assets");
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionInitialDate, setCorrectionInitialDate] = useState<string | undefined>(undefined);
  const [punchingDir, setPunchingDir] = useState<"in" | "out" | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, signOut, roles } = useAuth();
  const { data: profile } = useProfile();
  const { activeCompanyId, activeCompany } = useCompany();
  const portalName = (activeCompany?.portal_name && activeCompany.portal_name.trim())
    || (activeCompany?.name?.includes("אשל הירדן") ? "אשל שלי" : "פורטל עובדים");
  const portalLogoSrc = activeCompany?.portal_logo_url || portalLogo.url;
  const navigate = useNavigate();
  const createPunch = useCreateRemotePunch();
  const { toast } = useToast();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "עובד";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2);

  // Find employee record linked to current user
  const { data: myEmployee } = useQuery({
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

  // Auto-open attendance correction dialog from URL params (e.g. from gap email)
  useEffect(() => {
    if (!myEmployee?.id) return;
    const correction = searchParams.get("correction");
    const tab = searchParams.get("tab");
    const date = searchParams.get("date");
    if (tab === "attendance") setActiveTab("attendance");
    if (correction === "open") {
      if (date) setCorrectionInitialDate(date);
      setCorrectionOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("correction");
      next.delete("date");
      setSearchParams(next, { replace: true });
    }
  }, [myEmployee?.id, searchParams, setSearchParams]);

  // Prefixes considered "digital" (shown in הרשאות ומערכות section instead of ציוד פיזי)
  const DIGITAL_PREFIXES = ["DACC", "SFT"];

  // Fetch assets assigned to my employee
  const { data: myAssets = [] } = useQuery({
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

  // Fetch digital access for my employee (DACC + SFT categories)
  const { data: myDigitalAccess = [] } = useQuery({
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

  // Fetch attendance punches for my employee (last 30 days)
  const { data: myPunches = [] } = useMyPunches(myEmployee?.id, 30);
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
  const { data: portalContacts = [] } = useCompanyContacts();

  // Fetch announcements from DB
  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("published_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

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

  // Fetch knowledge base
  const { data: knowledgeBase = [] } = useQuery({
    queryKey: ["knowledge_base", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  const { data: myLeaveRequests = [] } = useMyLeaveRequests(myEmployee?.id);
  const { data: myCorrections = [] } = useMyAttendanceCorrections(myEmployee?.id);

  // Helper: calculate hours between check_in and check_out
  const calcHours = (checkIn: string | null, checkOut: string | null) => {
    if (!checkIn || !checkOut) return "—";
    const [h1, m1] = checkIn.split(":").map(Number);
    const [h2, m2] = checkOut.split(":").map(Number);
    const totalMin = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (totalMin <= 0) return "—";
    const hrs = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hrs}:${mins.toString().padStart(2, "0")}`;
  };

  const employeeName = myEmployee?.full_name || displayName;

  const handlePunch = (direction: "in" | "out") => {
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
        toast({ title: direction === "in" ? "כניסה נרשמה ✓" : "יציאה נרשמה ✓" });
      } catch (e: any) {
        toast({ title: "שגיאה בשליחה", description: e.message, variant: "destructive" });
      } finally {
        setPunchingDir(null);
      }
    };

    // High-accuracy stream — accept first reading ≤100m, otherwise keep collecting.
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!bestPos || pos.coords.accuracy < bestPos.coords.accuracy) {
            bestPos = pos;
          }
          if (pos.coords.accuracy <= 100) finish(pos);
        },
        (err) => {
          if (err.code === 1) finish(null, err);
          // codes 2/3 → keep waiting for fallback timers
        },
        { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
      );
    } catch (e: any) {
      finish(null, { message: e?.message ?? "watch failed" });
      return;
    }

    // After 8s — accept best reading or trigger low-accuracy fallback (Wi-Fi/cell).
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
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
      );
    }, 8000);

    // Absolute give-up after 25s.
    hardTimer = window.setTimeout(() => {
      if (bestPos) finish(bestPos);
      else finish(null, { code: 3, message: "timeout" } as GeolocationPositionError);
    }, 25000);
  };


  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <InstallAppBanner />
      {/* Mobile/tablet-friendly top bar */}
      <header role="banner" className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img src={portalLogoSrc} alt={portalName} className="w-9 h-9 rounded-full object-contain shrink-0 bg-white" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-tight truncate">{portalName} — שלום, {(employeeName.trim().split(/\s+/).slice(-1)[0]) || employeeName} <span aria-hidden="true">👋</span></h1>
            <p className="text-[11px] text-muted-foreground">
              {myEmployee ? `${myEmployee.role} • ${myEmployee.department}` : portalName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasDualAccess(roles) && (
            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem("activeExperience", "ops");
                navigate("/");
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="מעבר לתפעול 360"
              title="מעבר לתפעול 360"
            >
              <LayoutDashboard className="w-3.5 h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">תפעול 360</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="יציאה מהמערכת"
            title="יציאה"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="max-w-2xl md:max-w-3xl mx-auto px-4 py-4 space-y-4 overflow-x-hidden focus:outline-none">
        {/* Welcome banner */}
        <div className="bg-gradient-to-l from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 rounded-xl border border-primary/20 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground">ברוכים הבאים, {employeeName} 👋</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {myEmployee 
                  ? `${myEmployee.role} • מחלקת ${myEmployee.department}`
                  : "שמחים לראות אותך בפורטל העובדים"}
              </p>
            </div>
            <WelcomeDateTime />
          </div>
        </div>

        {/* Announcements & Birthdays card */}
        <div className="space-y-3">
          {(() => {
            const processed = processBirthdaysForCurrentMonth(birthdayEmployees as any);
            if (processed.length === 0) return null;
            return (
              <div className="bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200/50 dark:border-amber-800/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Cake className="w-4 h-4 text-amber-600" />
                  <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-300">🎂 ימי הולדת החודש</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {processed.map((emp) => {
                    const prefix = emp.isToday ? "🎉 היום!" : emp.isTomorrow ? "מחר" : null;
                    const dateText = prefix ? `${prefix} · ${emp.label}` : emp.label;
                    return (
                      <div key={emp.id} className="flex items-center gap-2 bg-white/60 dark:bg-white/10 rounded-lg px-3 py-1.5">
                        <PartyPopper className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-xs font-medium">{emp.full_name}</span>
                        <span className="text-[11px] text-muted-foreground">— {dateText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {announcements.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">הודעות חברה</h3>
              </div>
              <div className="space-y-2">
                {announcements.slice(0, 2).map((ann) => (
                  <div key={ann.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium">{ann.title}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(ann.published_at).toLocaleDateString("en-GB")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{ann.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick links */}
        {portalLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {portalLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border/50 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div role="tablist" aria-label="ניווט פורטל" className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
          {portalTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`portal-tabpanel-${tab.id}`}
                id={`portal-tab-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <tab.icon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ===== ASSETS TAB ===== */}
        {activeTab === "assets" && (
          <div role="tabpanel" id="portal-tabpanel-assets" aria-labelledby="portal-tab-assets" className="space-y-4 animate-fade-in">
            {!myEmployee && (
              <p className="text-center text-sm text-muted-foreground py-4">
                המשתמש שלך לא מקושר לעובד. פנה למנהל המערכת.
              </p>
            )}

            {myEmployee && (
              <>
                <Tax101Banner employee={myEmployee} />
                <PendingHandoverForms employeeId={myEmployee.id} />
                <h2 className="font-semibold text-sm">ציוד פיזי ({myAssets.length})</h2>
                {myAssets.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {myAssets.map((asset) => (
                      <div key={asset.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Box className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.asset_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {asset.asset_code}
                            {asset.serial_number && ` • ${asset.serial_number}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">אין ציוד משויך אליך</p>
                )}

                <h2 className="font-semibold text-sm mt-6">הרשאות ומערכות ({myDigitalAccess.length})</h2>
                {myDigitalAccess.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3">
                    {myDigitalAccess.map((item) => (
                      <div key={item.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Wifi className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.resource_path}</p>
                          <p className="text-xs text-muted-foreground">{item.access_type} • {item.permission_level}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-4">אין הרשאות דיגיטליות</p>
                )}

                {/* כפתור "דווח על ציוד תקול / בקשה לציוד חדש" הוסתר זמנית עד שיהיה פעיל */}
              </>
            )}
          </div>
        )}

        {/* ===== ATTENDANCE TAB ===== */}
        {activeTab === "attendance" && (
          <div role="tabpanel" id="portal-tabpanel-attendance" aria-labelledby="portal-tab-attendance" className="animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">נוכחות</h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-[11px]"
                disabled={!myEmployee}
                onClick={() => setCorrectionOpen(true)}
              >
                <AlertCircle className="w-3 h-3" />
                בקשת תיקון
              </Button>
            </div>

            {myCorrections.length > 0 && (
              <div className="bg-card rounded-xl border border-border/50 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">בקשות תיקון אחרונות</p>
                {myCorrections.slice(0, 3).map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between text-xs">
                    <span>{new Date(c.correction_date).toLocaleDateString("en-GB")}</span>
                    <span className={cn("px-2 py-0.5 rounded-full",
                      c.status === "approved" ? "bg-success/15 text-success" :
                      c.status === "rejected" ? "bg-destructive/15 text-destructive" :
                      c.status === "pending" ? "bg-warning/15 text-warning" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {{ pending: "ממתין", approved: "אושר", rejected: "נדחה", cancelled: "בוטל" }[c.status as string]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {!myEmployee && (
              <p className="text-center text-sm text-muted-foreground py-4">
                המשתמש שלך לא מקושר לעובד. פנה למנהל המערכת.
              </p>
            )}

            {myEmployee?.can_remote_punch && (
              <div className="bg-card rounded-xl border border-border/50 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">
                  דיווח נוכחות מרחוק (GPS)
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1"
                    disabled={punchingDir !== null}
                    onClick={() => handlePunch("in")}
                  >
                    <Clock className="w-3 h-3" />
                    {punchingDir === "in" ? "מאתר מיקום..." : "כניסה"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1"
                    disabled={punchingDir !== null}
                    onClick={() => handlePunch("out")}
                  >
                    <Clock className="w-3 h-3" />
                    {punchingDir === "out" ? "מאתר מיקום..." : "יציאה"}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  בלחיצה ראשונה הדפדפן יבקש אישור גישה למיקום. לאחר אישור, ההחתמה תתבצע מיידית.
                </p>
              </div>
            )}


            {myEmployee && myPunches.length > 0 ? (
              <div className="space-y-2">
                {(() => {
                  // Group punches by day
                  const byDay = new Map<string, typeof myPunches>();
                  for (const p of myPunches) {
                    const day = new Date(p.punch_at).toLocaleDateString("en-GB");
                    if (!byDay.has(day)) byDay.set(day, [] as any);
                    byDay.get(day)!.push(p);
                  }
                  return Array.from(byDay.entries()).map(([day, items]) => {
                    const sorted = [...items].sort((a, b) => a.punch_at.localeCompare(b.punch_at));
                    const ins = sorted.filter((p) => p.direction === "in");
                    const outs = sorted.filter((p) => p.direction === "out");
                    const firstIn = ins[0]?.punch_at;
                    const lastOut = outs[outs.length - 1]?.punch_at;
                    const hours = firstIn && lastOut ? calcHours(
                      new Date(firstIn).toTimeString().slice(0, 5),
                      new Date(lastOut).toTimeString().slice(0, 5),
                    ) : "—";
                    const isRemote = sorted.some((p) => p.source === "portal_remote");
                    return (
                      <div key={day} className="bg-card rounded-xl border border-border/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">{day}</span>
                          <span className={cn(
                            "text-[11px] px-2 py-0.5 rounded-full font-medium",
                            isRemote ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"
                          )}>
                            {isRemote ? "מרחוק 🖊️" : "שעון"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span>כניסה: <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                            {firstIn ? new Date(firstIn).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span></span>
                          <span>יציאה: <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                            {lastOut ? new Date(lastOut).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span></span>
                          <span className="font-semibold text-foreground">{hours} שעות</span>
                          <span className="text-[10px]">({sorted.length} פעימות)</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : myEmployee ? (
              <p className="text-center text-sm text-muted-foreground py-4">אין רשומות נוכחות</p>
            ) : null}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              היומן מתעדכן אוטומטית מהשעון. לתיקון — שלח/י בקשת תיקון.
            </p>
          </div>
        )}

        {/* ===== HR TAB ===== */}
        {activeTab === "hr" && (
          <div role="tabpanel" id="portal-tabpanel-hr" aria-labelledby="portal-tab-hr" className="space-y-4 animate-fade-in">
            <div className="bg-card rounded-xl border border-border/50 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                יתרות חופשה ומחלה
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-2xl font-bold text-primary">
                    {myEmployee?.vacation_balance != null
                      ? Number(myEmployee.vacation_balance).toFixed(2)
                      : "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">ימי חופשה</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-2xl font-bold text-info">
                    {myEmployee?.sick_balance != null
                      ? Number(myEmployee.sick_balance).toFixed(2)
                      : "—"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">ימי מחלה</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">
                {myEmployee?.balances_updated_at ? (
                  <>
                    עודכן לאחרונה: {new Date(myEmployee.balances_updated_at).toLocaleDateString("en-GB")}
                    {" · "}
                    מקור: {myEmployee?.balances_source === "payslip" ? "תלוש שכר" : "ידני"}
                  </>
                ) : (
                  "* היתרות מתעדכנות אוטומטית מתלושי השכר"
                )}
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  בקשות חופשה ומחלה
                </h3>
                <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => setNewLeaveOpen(true)} disabled={!myEmployee}>
                  <Plus className="w-3 h-3" />
                  בקשה חדשה
                </Button>
              </div>
              <LeaveRequestsList requests={myLeaveRequests} allowCancel />
            </div>

            <div className="bg-card rounded-xl border border-border/50 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                תלושי שכר
              </h3>
              {myEmployee ? (
                <EmployeePayslipsTab employeeId={myEmployee.id} employee={myEmployee} canSeeSalary={true} hideBalances />
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">אין מידע זמין</p>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border/50 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                טפסי 101
              </h3>
              <MyTax101FormsList employeeId={myEmployee?.id} />
            </div>

            <BirthdayPreferenceCard employee={myEmployee} />
          </div>
        )}

        {/* ===== NEWS TAB ===== */}
        {activeTab === "news" && (
          <div role="tabpanel" id="portal-tabpanel-news" aria-labelledby="portal-tab-news" className="space-y-3 animate-fade-in">
            {announcements.length > 0 ? announcements.map((item) => (
              <div key={item.id} className="bg-card rounded-xl border border-border/50 p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(item.published_at).toLocaleDateString("en-GB")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.content}</p>
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין הודעות כרגע</p>
            )}
          </div>
        )}

        {/* ===== KB TAB ===== */}
        {activeTab === "kb" && (
          <div role="tabpanel" id="portal-tabpanel-kb" aria-labelledby="portal-tab-kb" className="space-y-2 animate-fade-in">
            {knowledgeBase.length > 0 ? knowledgeBase.map((doc) => (
              <div key={doc.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer transition-colors active:scale-[0.98]">
                <BookOpen className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{doc.title}</span>
                  {doc.category && <span className="text-[10px] text-muted-foreground">{doc.category}</span>}
                </div>
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין נהלים כרגע</p>
            )}
          </div>
        )}

        {/* ===== CONTACTS TAB ===== */}
        {activeTab === "contacts" && (
          <div role="tabpanel" id="portal-tabpanel-contacts" aria-labelledby="portal-tab-contacts" className="space-y-2 animate-fade-in">
            {portalContacts.length > 0 ? portalContacts.map((contact) => (
              <div key={contact.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{contact.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{contact.role} • {contact.department}</p>
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="text-[11px] text-primary hover:underline truncate block" dir="ltr">
                      {contact.email}
                    </a>
                  )}
                </div>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded p-1" aria-label={`התקשר אל ${contact.name}: ${contact.phone}`} title={contact.phone}>
                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין אנשי קשר כרגע</p>
            )}
          </div>
        )}

        <div className="h-6" />
      </main>

      {myEmployee && (
        <>
          <NewLeaveRequestDialog
            open={newLeaveOpen}
            onOpenChange={setNewLeaveOpen}
            employeeId={myEmployee.id}
            managerId={myEmployee.direct_manager_id ?? null}
          />
          <AttendanceCorrectionDialog
            open={correctionOpen}
            onClose={() => { setCorrectionOpen(false); setCorrectionInitialDate(undefined); }}
            employeeId={myEmployee.id}
            managerId={myEmployee.direct_manager_id ?? null}
            initiatedBy="employee"
            initialDate={correctionInitialDate}
            tracksAttendance={myEmployee.tracks_attendance !== false}
          />
        </>
      )}
    </div>
  );
}
