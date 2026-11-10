import { lazyWithReload } from "@/lib/lazyWithReload";
import { Suspense } from "react";
import { HubTabBar } from "@/components/hub/HubTabBar";
import { ListSkeleton } from "@/components/feedback/StateView";
import { useHubTab } from "@/hooks/useHubTab";

const RequestsTab = lazyWithReload(() =>
  import("@/components/systemAccess/RequestsTab").then((m) => ({ default: m.RequestsTab })),
);
const MatrixTab = lazyWithReload(() =>
  import("@/components/systemAccess/MatrixTab").then((m) => ({ default: m.MatrixTab })),
);
const SystemsTab = lazyWithReload(() =>
  import("@/components/systemAccess/SystemsTab").then((m) => ({ default: m.SystemsTab })),
);
const AccessTreeTab = lazyWithReload(() =>
  import("@/components/systemAccess/AccessTreeTab").then((m) => ({ default: m.AccessTreeTab })),
);

const TAB_CONTENT: Record<string, React.ComponentType> = {
  requests: RequestsTab,
  matrix: MatrixTab,
  systems: SystemsTab,
  tree: AccessTreeTab,
};

/** Hub: access requests and their handling, the organisation's systems, folder trees and access groups. */
export default function SystemAccess() {
  const { tabs, active, setActive } = useHubTab("systemAccess");
  const Content = active ? TAB_CONTENT[active] : null;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">הרשאות מערכות</h1>
        <p className="page-subtitle">בקשות הרשאה וטיפול בהן, המערכות של הארגון, התיקיות וקבוצות הגישה</p>
      </div>
      <HubTabBar tabs={tabs} active={active} onChange={setActive} label="הרשאות מערכות" />
      {Content && (
        <Suspense fallback={<ListSkeleton rows={5} />}>
          <div role="tabpanel" aria-label={tabs.find((t) => t.key === active)?.label}>
            <Content />
          </div>
        </Suspense>
      )}
    </div>
  );
}
