import { Clock, AlertTriangle, OctagonAlert, Info, Package, User, Bell } from "lucide-react";
import { EMPTY_ICONS } from "@/components/feedback/emptyIcons";
import { StateView } from "@/components/feedback/StateView";
import { daysUntil, relativeDay } from "@/lib/alertGroups";
import { useAlerts } from "@/hooks/useData";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";

const severityStyle: Record<string, string> = {
  critical: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  info: "border-info/30 bg-info/5",
};
const severityBadge: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
};
const severityIcon = { critical: OctagonAlert, warning: AlertTriangle, info: Info } as const;
const severityLabel: Record<string, string> = {
  critical: "קריטי", warning: "אזהרה", info: "מידע",
};

export default function Alerts() {
  const { data: alerts, isLoading, error, refetch } = useAlerts();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">התראות</h1>
          <p className="page-subtitle">
            {alerts?.length ?? 0} התראות פעילות • {alerts?.filter(a => a.severity === "critical").length ?? 0} קריטיות
          </p>
        </div>
        <ExportExcelButton
          disabled={!alerts?.length}
          onClick={() => {
            if (!alerts?.length) return;
            exportToExcel(
              alerts.map((a: any) => ({
                ...a,
                severity_label: severityLabel[a.severity] ?? a.severity,
                target_date_fmt: a.target_date ? new Date(a.target_date).toLocaleDateString("en-GB") : "",
              })),
              [
                { key: "title", label: "כותרת" },
                { key: "category", label: "קטגוריה" },
                { key: "severity_label", label: "חומרה" },
                { key: "target_date_fmt", label: "תאריך יעד" },
              ],
              "התראות"
            );
          }}
        />
      </div>

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        label="התראות"
        isEmpty={!alerts?.length}
        empty={{ title: "אין התראות פתוחות", description: "תפוגות, ציוד ללא שיוך ועובדים בתהליך עזיבה יופיעו כאן.", icons: EMPTY_ICONS.alerts }}
      >
        <ul className="space-y-3">
          {(alerts ?? []).map((alert) => {
            const SevIcon = severityIcon[alert.severity as keyof typeof severityIcon] ?? Info;
            const KindIcon = alert.related_asset_id ? Package : alert.related_employee_id ? User : AlertTriangle;
            const days = alert.target_date ? daysUntil(alert.target_date) : null;
            return (
              <li key={alert.id} className={`bg-card rounded-xl border p-4 flex flex-wrap items-center gap-x-4 gap-y-2 ${severityStyle[alert.severity] ?? ""}`}>
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                  <KindIcon className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-[12rem]">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.category}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md font-semibold ${severityBadge[alert.severity] ?? ""}`}>
                    <SevIcon className="w-3 h-3" aria-hidden="true" />
                    {severityLabel[alert.severity] ?? alert.severity}
                  </span>
                  <span className={`text-xs flex items-center gap-1 tabular-nums ${days !== null && days < 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {alert.target_date ? `${new Date(alert.target_date).toLocaleDateString("he-IL")} · ${relativeDay(days!)}` : "ללא תאריך יעד"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </StateView>
    </div>
  );
}
