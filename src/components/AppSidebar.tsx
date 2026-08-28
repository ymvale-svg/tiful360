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
  LogOut,
  Crown,
  Wallet,
  Megaphone,
  UserPlus,
  MapPin,
} from "lucide-react";
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
};

const mainNav: NavItem[] = [
  { label: "לוח בקרה", icon: LayoutDashboard, path: "/", roles: ["admin", "it_manager", "super_admin", "operations", "payroll", "hr", "finance"] },
  { label: "עובדים", icon: Users, path: "/employees", roles: ["admin", "super_admin", "operations", "payroll", "hr", "finance"] },
  { label: "משאבים", icon: Package, path: "/assets", roles: ["admin", "it_manager", "super_admin", "operations", "finance", "legal"], preload: preload.assets },
  { label: "משימות IT", icon: Shield, path: "/it-tickets", roles: ["admin", "it_manager", "super_admin", "operations"], preload: preload.itTickets },
  { label: "משאבי אנוש", icon: Wallet, path: "/payroll", roles: ["admin", "super_admin", "payroll", "hr"], preload: preload.payroll },
  // Onboarding / attendance map live inside the HR hub, but roles without /payroll access keep a direct entry
  { label: "קליטת עובדים", icon: UserPlus, path: "/onboarding", roles: ["operations", "it_manager"], preload: preload.onboarding },
  { label: "מפת נוכחות", icon: MapPin, path: "/attendance-map", roles: ["direct_manager"] },

  { label: "הודעות", icon: Megaphone, path: "/announcements", roles: ["admin", "super_admin", "ceo", "operations", "secretariat", "hr"], preload: preload.announcements },
];

const superAdminNav: NavItem[] = [
  { label: "ניהול חברות", icon: Building2, path: "/companies", roles: ["super_admin"], preload: preload.companies },
];

const portalNav: NavItem[] = [
  { label: "פורטל עובדים", icon: UserCircle, path: "/portal", preload: preload.portal },
];

const bottomNav: NavItem[] = [
  { label: "הגדרות", icon: Settings, path: "/settings", roles: ["admin", "super_admin"], preload: preload.settings },
];

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
  const { roles, signOut, user, isSuperAdmin } = useAuth();

  const canSee = (item: NavItem) => {
    if (!item.roles) return true;
    if (isSuperAdmin) return true;
    return item.roles.some((r) => roles.includes(r));
  };

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.path ||
      (item.path !== "/" && location.pathname.startsWith(item.path));
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
          "sidebar-item",
          isActive ? "sidebar-item-active" : "sidebar-item-inactive",
          isLoading && "opacity-70"
        )}
        title={collapsed && !mobileOpen ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        {(!collapsed || mobileOpen) && <span>{item.label}</span>}
      </a>
    );
  };

  const visibleMain = mainNav.filter(canSee);
  const visibleSuperAdmin = superAdminNav.filter(canSee);
  const visiblePortal = portalNav.filter(canSee);
  const visibleBottom = bottomNav.filter(canSee);

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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {/* Super Admin section */}
        {visibleSuperAdmin.length > 0 && (
          <>
            <div className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <p className="px-3 py-1 text-[11px] font-medium text-sidebar-muted uppercase tracking-wider flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  סופר אדמין
                </p>
              )}
              {visibleSuperAdmin.map((item) => (
                <NavItemComponent key={item.path} item={item} />
              ))}
            </div>
            <div className="my-4 border-t border-sidebar-border" />
          </>
        )}

        <div className="space-y-1">
          {visibleMain.map((item) => (
            <NavItemComponent key={item.path} item={item} />
          ))}
        </div>

        <div className="my-4 border-t border-sidebar-border" />

        <div className="space-y-1">
          {(!collapsed || mobileOpen) && (
            <p className="px-3 py-1 text-[11px] font-medium text-sidebar-muted uppercase tracking-wider">
              פורטל
            </p>
          )}
          {visiblePortal.map((item) => (
            <NavItemComponent key={item.path} item={item} />
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {visibleBottom.map((item) => (
          <NavItemComponent key={item.path} item={item} />
        ))}

        <button
          onClick={() => signOut()}
          className="sidebar-item sidebar-item-inactive w-full"
          title={collapsed ? "התנתק" : undefined}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!collapsed || mobileOpen) && <span>התנתק</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-item sidebar-item-inactive w-full hidden lg:flex"
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
