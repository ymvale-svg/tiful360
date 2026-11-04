import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HubTab } from "@/lib/screenAccess";

interface HubTabBarProps {
  tabs: readonly HubTab[];
  active: string | null;
  onChange: (key: string) => void;
  /** Accessible name of the tab list, e.g. the hub's title. */
  label: string;
  className?: string;
}

/**
 * Tab bar of a hub screen. Renders nothing when the user may open only one tab, so a
 * single-purpose role sees a plain screen instead of a lone tab.
 */
export function HubTabBar({ tabs, active, onChange, label, className }: HubTabBarProps) {
  if (tabs.length < 2 || !active) return null;
  return (
    <Tabs value={active} onValueChange={onChange} dir="rtl" className={className}>
      <TabsList aria-label={label}>
        {tabs.map((t) => (
          <TabsTrigger key={t.key} value={t.key}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
