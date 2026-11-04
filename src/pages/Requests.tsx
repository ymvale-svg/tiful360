import { lazy, Suspense } from "react";
import { HubTabBar } from "@/components/hub/HubTabBar";
import { ListSkeleton } from "@/components/feedback/StateView";
import { useHubTab } from "@/hooks/useHubTab";

// Each tab is its own chunk; the map tab is the only one that loads leaflet.
const LeaveRequests = lazy(() => import("@/pages/LeaveRequests"));
const AttendanceCorrections = lazy(() => import("@/pages/AttendanceCorrections"));
const AttendanceMap = lazy(() => import("@/pages/AttendanceMap"));
const MonthlyAttendanceReview = lazy(() =>
  import("@/components/payroll/MonthlyAttendanceReview").then((m) => ({ default: m.MonthlyAttendanceReview })),
);

const TAB_CONTENT: Record<string, React.ComponentType> = {
  reports: MonthlyAttendanceReview,
  leave: LeaveRequests,
  corrections: AttendanceCorrections,
  map: AttendanceMap,
};

/** Hub: attendance reports, leave requests, attendance corrections and the live attendance map. */
export default function Requests() {
  const { tabs, active, setActive } = useHubTab("requests");
  const Content = active ? TAB_CONTENT[active] : null;

  return (
    <div className="space-y-4">
      <HubTabBar tabs={tabs} active={active} onChange={setActive} label="נוכחות ובקשות" />
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
