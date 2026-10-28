import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  Shield,
  UserCircle,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Wallet,
  Megaphone,
  UserPlus,
  MapPin,
  Bell,
  CalendarDays,
  ClipboardCheck,
  PackageOpen,
  Car,
  Tags,
} from "lucide-react";
import { useAlerts, useDashboardStats } from "@/hooks/useData";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import logoImg from "@/assets/logo.png";

type AppRole = "admin" | "it_manager" | "employee" | "super_admin" | "direct_manager" | "payroll" | "hr" | "operations" | "finance" | "legal" | "secretariat" | "ceo";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  roles?: AppRole[];
  /** When true, the super-admin bypass does not apply (item is only for the listed roles). */
  strictRoles?: boolean;
  preload?: () => Promise<unknown>;
}

// Preload functions for lazy chunks — triggered on hover for instant navigation
const preload = {
  assets: () => import("@/pages/Assets"),
  itTickets: () => import("@/pages/ITTickets"),
  payroll: () => import("@/pages/Payroll"),
  settings: () => import("@/pages/Settings"),
  portal: () => import("@/pages/EmployeePortal"),
  companies: () => import("@/pages/Companies"),
  announcements: () => import("@/pages/Announcements"),
  onboarding: () => import("@/pages/Onboarding"),
};

const ALL_OPS: AppRole[] = ["admin", "it_manager", "super_admin", "operations", "direct_manager", "payroll", "hr", "finance", "legal", "secretariat", "ceo"];

type CountKey = "alerts" | "onboarding" | "tickets";

interface NavGroup {
  title?: string;
  icon?: typeof Crown;
  items: (NavItem & { count?: CountKey })[];
}

/**
 * One fixed map for every role: roles hide items, they never move them. Paths match the routes
 * in App.tsx and their role lists, so every screen a user may open is reachable from here.
 */
export const navGroups: NavGroup[] = [
  {
    items: [
      { label: "לוח בקרה", icon: LayoutDashboard, path: "/", roles: ["admin", "it_manager", "super_admin", "operations", "payroll", "hr", "finance"] },
      { label: "התראות", icon: Bell, path: "/alerts", roles: ["admin", "it_manager", "super_admin"], count: "alerts" },
    ],
  },
  {
    title: "אנשים",
    items: [
      { label: "עובדים", icon: Users, path: "/employees", roles: ["admin", "super_admin", "operations", "payroll", "hr", "finance"] },
      { label: "קליטת עובדים", icon: UserPlus, path: "/onboarding", roles: ["admin", "super_admin", "operations", "it_manager", "hr"], preload: preload.onboarding, count: "onboarding" },
      { label: "בקשות חופשה", icon: CalendarDays, path: "/leave-requests", roles: ["admin", "super_admin", "direct_manager", "payroll", "hr"] },
      { label: "תיקוני נוכחות", icon: ClipboardCheck, path: "/attendance-corrections", roles: ["admin", "super_admin", "direct_manager", "payroll", "hr"] },
      { label: "מפת נוכחות", icon: MapPin, path: "/attendance-map", roles: ["admin", "super_admin", "payroll", "hr", "direct_manager"] },
      { label: "שכר ונוכחות", icon: Wallet, path: "/payroll", roles: ["admin", "super_admin", "payroll", "hr"], preload: preload.payroll },
    ],
  },
  {
    title: "משאבים",
    items: [
      { label: "ציוד והרשאות", icon: Package, path: "/assets", roles: ["admin", "it_manager", "super_admin", "operations", "finance", "legal"], preload: preload.assets },
      { label: "ממתינים לשיוך", icon: PackageOpen, path: "/assets-handover", roles: ["admin", "it_manager", "super_admin", "operations", "finance", "legal"] },
      { label: "רכב ומנויים", icon: Car, path: "/assets-subscriptions", roles: ["admin", "super_admin", "operations", "finance", "payroll"] },
    ],
  },
  {
    title: "שירות ותקשורת",
    items: [
      { label: "קריאות שירות", icon: Shield, path: "/it-tickets", roles: ALL_OPS, preload: preload.itTickets, count: "tickets" },
      { label: "הודעות לעובדים", icon: Megaphone, path: "/announcements", roles: ["admin", "super_admin", "ceo", "operations", "secretariat", "hr"], preload: preload.announcements },
    ],
  },
  {
    title: "ניהול",
    items: [
      { label: "הגדרות", icon: Settings, path: "/settings", roles: ["admin", "super_admin"], preload: preload.settings },
      { label: "קטגוריות ציוד", icon: Tags, path: "/categories", roles: ["admin", "super_admin", "operations", "legal"] },
      { label: "ניהול חברות", icon: Building2, path: "/companies", roles: ["super_admin"], strictRoles: true, preload: preload.companies },
    ],
  },
  {
    title: "פורטל",
    items: [
      { label: "פורטל עובדים", icon: UserCircle, path: "/portal", preload: preload.portal },
    ],
  },
];

/** Same rule the routes use: listed roles, with a super-admin bypass unless strictRoles. */
export function canSeeNavItem(item: Pick<NavItem, "roles" | "strictRoles">, roles: readonly AppRole[], isSuperAdmin: boolean) {
  if (!item.roles) return true;
  if (item.strictRoles) return item.roles.some((r) => roles.includes(r));
  if (isSuperAdmin) return true;
  return item.roles.some((r) => roles.includes(r));
}

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

export function AppSidebar({ mobileOpen = false, onMobileOpenChange }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1024 : false
  );

  // Auto-collapse when viewport shrinks below lg; auto-expand on desktop
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 1023px)");
    const updateLayout = (isCompact: boolean) => {
      setCollapsed(isCompact);
      document.documentElement.style.setProperty(
        "--sidebar-width",
        isCompact ? "0px" : "240px"
      );
      if (!isCompact) onMobileOpenChange?.(false);
    };
    updateLayout(mql.matches);
    const onChange = (e: MediaQueryListEvent) => updateLayout(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [onMobileOpenChange]);

  // Broadcast width so layout can adjust its right margin
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      document.documentElement.style.setProperty(
        "--sidebar-width",
        collapsed ? "68px" : "240px"
      );
    }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMobileOpenChange?.(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, onMobileOpenChange]);
  const { roles, isSuperAdmin } = useAuth();
  const { data: alerts } = useAlerts();
  const { data: stats } = useDashboardStats();
  const counts: Record<CountKey, { value: number; noun: string }> = {
    alerts: { value: alerts?.length ?? 0, noun: "התראות פתוחות" },
    onboarding: { value: stats?.onboardingEmployees ?? 0, noun: "עובדים בקליטה" },
    tickets: { value: stats?.openTickets ?? 0, noun: "קריאות פתוחות" },
  };

  const canSee = (item: NavItem) => canSeeNavItem(item, roles as AppRole[], isSuperAdmin);

  const NavItemComponent = ({ item }: { item: NavItem & { count?: CountKey } }) => {
    // "/assets" must not light up on "/assets-handover": match whole path segments only.
    const isActive = location.pathname === item.path ||
      (item.path !== "/" && location.pathname.startsWith(`${item.path}/`));
    const count = item.count ? counts[item.count] : null;
    const expanded = !collapsed || mobileOpen;
    const isLoading = isPending && pendingPath === item.path;

    const handleClick = (e: React.MouseEvent) => {
      // Allow modifier keys / middle click to behave like a normal link
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (e as any).button === 1) return;
      e.preventDefault();
      if (location.pathname === item.path) return;
      setPendingPath(item.path);
      onMobileOpenChange?.(false);
      startTransition(() => {
        navigate(item.path);
      });
    };

    return (
      <a
        href={item.path}
        onClick={handleClick}
        onMouseEnter={() => item.preload?.()}
        onFocus={() => item.preload?.()}
        className={cn(
          "sidebar-item relative",
          isActive ? "sidebar-item-active" : "sidebar-item-inactive",
          isLoading && "opacity-70"
        )}
        title={collapsed && !mobileOpen ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-label={count?.value ? `${item.label}, ${count.value} ${count.noun}` : undefined}
      >
        <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
        {expanded && <span className="flex-1">{item.label}</span>}
        {count && count.value > 0 && (
          <span
            aria-hidden="true"
            className={cn(
              "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 tabular-nums",
              item.count === "alerts" ? "bg-destructive text-destructive-foreground" : "bg-sidebar-foreground/15 text-sidebar-foreground",
              !expanded && "absolute -top-1 -left-1",
            )}
          >
            {count.value > 99 ? "99+" : count.value}
          </span>
        )}
      </a>
    );
  };

  const visibleGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const sidebar = (
    <aside
      className={cn(
        "fixed top-0 right-0 h-[100dvh] bg-sidebar flex flex-col z-50 transition-all duration-300 border-l border-sidebar-border",
        mobileOpen ? "w-[280px] translate-x-0" : "w-[280px] translate-x-full lg:translate-x-0",
        collapsed ? "lg:w-[68px]" : "lg:w-[240px]"
      )}
      aria-label="ניווט ראשי"
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border min-h-[64px]">
        <img src={logoImg} alt="תפעול 360" className="w-9 h-9 rounded-lg shrink-0 object-contain" />
        {(!collapsed || mobileOpen) && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-foreground whitespace-nowrap">תפעול 360</h1>
            <p className="text-[11px] text-sidebar-muted whitespace-nowrap">ניהול משאבים מרכזי</p>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 p-3 overflow-y-auto" aria-label="תפריט">
        {visibleGroups.map((g, i) => (
          <div key={g.title ?? i} className={cn("space-y-1", i > 0 && "mt-4")} role="group" aria-label={g.title}>
            {g.title && (!collapsed || mobileOpen) && (
              <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-sidebar-muted">{g.title}</p>
            )}
            {g.title && collapsed && !mobileOpen && <div className="mx-3 mb-2 border-t border-sidebar-border" aria-hidden="true" />}
            {g.items.map((item) => (
              <NavItemComponent key={item.path} item={item} />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-item sidebar-item-inactive w-full hidden lg:flex"
          aria-label={collapsed ? "הרחבת התפריט" : "כיווץ התפריט"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronLeft className="w-5 h-5 shrink-0" />
          ) : (
            <>
              <ChevronRight className="w-5 h-5 shrink-0" />
              <span>כווץ תפריט</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-foreground/30 lg:hidden"
          aria-label="סגירת התפריט"
          onClick={() => onMobileOpenChange?.(false)}
        />
      )}
      {sidebar}
    </>
  );
}
