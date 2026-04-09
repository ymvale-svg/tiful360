import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  Shield,
  UserCircle,
  Bell,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  Boxes,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const mainNav = [
  { label: "לוח בקרה", icon: LayoutDashboard, path: "/" },
  { label: "עובדים", icon: Users, path: "/employees" },
  { label: "נכסים וציוד", icon: Package, path: "/assets" },
  { label: "קטגוריות ציוד", icon: Boxes, path: "/categories" },
  { label: "משימות IT", icon: Shield, path: "/it-tickets" },
  { label: "התראות", icon: Bell, path: "/alerts" },
];

const portalNav = [
  { label: "פורטל עובדים", icon: UserCircle, path: "/portal" },
];

const bottomNav = [
  { label: "הגדרות", icon: Settings, path: "/settings" },
];

export function AppSidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const NavItem = ({ item }: { item: typeof mainNav[0] }) => {
    const isActive = location.pathname === item.path || 
      (item.path !== "/" && location.pathname.startsWith(item.path));

    return (
      <Link
        to={item.path}
        className={cn(
          "sidebar-item",
          isActive ? "sidebar-item-active" : "sidebar-item-inactive"
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon className="w-5 h-5 shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "fixed top-0 right-0 h-screen bg-sidebar flex flex-col z-40 transition-all duration-300 border-l border-sidebar-border",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border min-h-[64px]">
        <div className="w-9 h-9 rounded-lg bg-sidebar-primary flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-sidebar-foreground whitespace-nowrap">תפעול 360</h1>
            <p className="text-[11px] text-sidebar-muted whitespace-nowrap">ניהול משאבים מרכזי</p>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </div>

        <div className="my-4 border-t border-sidebar-border" />

        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 py-1 text-[11px] font-medium text-sidebar-muted uppercase tracking-wider">
              פורטל
            </p>
          )}
          {portalNav.map((item) => (
            <NavItem key={item.path} item={item} />
          ))}
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {bottomNav.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}
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
