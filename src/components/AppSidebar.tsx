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
  MapPin,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import logoImg from "@/assets/logo.png";

type AppRole = "admin" | "it_manager" | "employee" | "super_admin" | "direct_manager" | "payroll" | "hr" | "operations" | "finance" | "legal";

interface NavItem {
  label: string;
  icon: any;
  path: string;
  roles?: AppRole[];
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
};

const mainNav: NavItem[] = [
  { label: "לוח בקרה", icon: LayoutDashboard, path: "/", roles: ["admin", "it_manager", "super_admin", "operations", "payroll", "hr", "finance"] },
  { label: "עובדים", icon: Users, path: "/employees", roles: ["admin", "super_admin", "operations", "payroll", "hr", "finance"] },
  { label: "משאבים", icon: Package, path: "/assets", roles: ["admin", "it_manager", "super_admin", "operations", "finance", "legal"], preload: preload.assets },
  { label: "משימות IT", icon: Shield, path: "/it-tickets", roles: ["admin", "it_manager", "super_admin", "operations"], preload: preload.itTickets },
  { label: "משאבי אנוש", icon: Wallet, path: "/payroll", roles: ["admin", "super_admin", "payroll", "hr", "finance"], preload: preload.payroll },
  { label: "מפת נוכחות", icon: MapPin, path: "/attendance-map", roles: ["admin", "super_admin", "payroll", "hr", "direct_manager"] },
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

export function AppSidebar() {
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
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Broadcast width so layout can adjust its right margin
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "68px" : "240px"
    );
  }, [collapsed]);
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
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </a>
    );
  };

  const visibleMain = mainNav.filter(canSee);
  const visibleSuperAdmin = superAdminNav.filter(canSee);
  const visiblePortal = portalNav.filter(canSee);
  const visibleBottom = bottomNav.filter(canSee);

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 h-screen bg-sidebar flex flex-col z-40 transition-all duration-300 border-l border-sidebar-border",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border min-h-[64px]">
        <img src={logoImg} alt="תפעול 360" className="w-9 h-9 rounded-lg shrink-0 object-contain" />
        {!collapsed && (
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
              {!collapsed && (
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
          {!collapsed && (
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
          {!collapsed && <span>התנתק</span>}
        </button>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-item sidebar-item-inactive w-full"
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
}
