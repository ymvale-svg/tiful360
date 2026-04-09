import { Clock, AlertTriangle } from "lucide-react";
import { useAlerts } from "@/hooks/useData";

const severityStyle: Record<string, string> = {
  critical: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  info: "border-info/30 bg-info/5",
};
const severityBadge: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
};
const severityLabel: Record<string, string> = {
  critical: "קריטי", warning: "אזהרה", info: "מידע",
};

export default function Alerts() {
  const { data: alerts, isLoading } = useAlerts();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">התראות</h1>
        <p className="page-subtitle">
          {alerts?.length ?? 0} התראות פעילות • {alerts?.filter(a => a.severity === "critical").length ?? 0} קריטיות
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <div className="space-y-3">
          {(alerts ?? []).map((alert) => (
            <div key={alert.id} className={`bg-card rounded-xl border p-4 flex items-center gap-4 ${severityStyle[alert.severity] ?? ""}`}>
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{alert.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{alert.category}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityBadge[alert.severity] ?? ""}`}>
                  {severityLabel[alert.severity] ?? alert.severity}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {alert.target_date ? new Date(alert.target_date).toLocaleDateString("he-IL") : "—"}
                </span>
              </div>
            </div>
          ))}
          {(!alerts || alerts.length === 0) && (
            <div className="text-center py-12 text-muted-foreground">אין התראות פתוחות</div>
          )}
        </div>
      )}
    </div>
  );
}
