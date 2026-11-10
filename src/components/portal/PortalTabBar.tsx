import { useEffect } from "react";
import { Home, Clock, ClipboardList, BookOpen, Menu, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalTab } from "./portalTabs";

export const PORTAL_TABS: { id: PortalTab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "בית", icon: Home },
  { id: "attendance", label: "נוכחות", icon: Clock },
  { id: "requests", label: "בקשות", icon: ClipboardList },
  { id: "knowledge", label: "ידע", icon: BookOpen },
  { id: "more", label: "עוד", icon: Menu },
];

/**
 * Portal navigation. Phones: a fixed bottom tab bar above the home indicator (pages reserve
 * `PORTAL_TABBAR_SPACE` at the bottom). md+: an inline tab row under the header.
 * The active tab is shown by colour, weight and an indicator line, and marked aria-current.
 */
export function PortalTabBar({ active, onSelect, badges }: {
  active: PortalTab;
  onSelect: (tab: PortalTab) => void;
  /** Small count shown on a tab, e.g. pending items on "בית". */
  badges?: Partial<Record<PortalTab, number>>;
}) {
  // Lets other fixed widgets (the upload progress center) sit above the phone tab bar.
  useEffect(() => {
    document.documentElement.classList.add("has-portal-tabbar");
    return () => document.documentElement.classList.remove("has-portal-tabbar");
  }, []);
  return (
    <nav
      aria-label="ניווט פורטל"
      className={cn(
        "z-40 bg-card/95 backdrop-blur-md border-border",
        "fixed inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom,0px)]",
        "md:static md:inset-auto md:rounded-xl md:border md:pb-0",
      )}
    >
      <ul className="mx-auto grid max-w-2xl md:max-w-3xl grid-cols-5">
        {PORTAL_TABS.map((tab) => {
          const isActive = tab.id === active;
          const badge = badges?.[tab.id] ?? 0;
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onSelect(tab.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex w-full min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs transition-colors",
                  "md:min-h-11 md:flex-row md:gap-2 md:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  "[touch-action:manipulation]",
                  isActive ? "text-primary font-bold" : "text-muted-foreground font-medium hover:text-foreground",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-4 top-0 h-0.5 rounded-full md:top-auto md:bottom-0",
                    isActive ? "bg-primary" : "bg-transparent",
                  )}
                />
                <span className="relative">
                  <tab.icon className={cn("h-6 w-6 md:h-4 md:w-4", isActive && "stroke-[2.5]")} aria-hidden="true" />
                  {badge > 0 && (
                    <span aria-hidden="true" className="absolute -top-1.5 -end-2 min-w-[1.125rem] h-[1.125rem] rounded-full bg-destructive px-1 text-[0.75rem] leading-[1.125rem] font-bold text-destructive-foreground text-center md:static md:ms-1">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span>
                  {tab.label}
                  {badge > 0 && <span className="sr-only"> ({badge} ממתינים)</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Bottom padding that keeps page content clear of the fixed phone tab bar. */
export const PORTAL_TABBAR_SPACE = "pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-8";
