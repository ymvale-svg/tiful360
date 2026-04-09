import { Bell, AlertTriangle, Clock, Car, Monitor, Shield, FileText } from "lucide-react";

const alerts = [
  { id: 1, title: "טסט רכב 23-456-78 פג בעוד 5 ימים", category: "רכבים", severity: "warning" as const, date: "14/04/2026", icon: Car },
  { id: 2, title: "פקיעת ביטוח רכב 34-567-89", category: "רכבים", severity: "warning" as const, date: "27/04/2026", icon: Car },
  { id: 3, title: "חידוש רישיון AutoCAD - 3 עמדות", category: "תוכנה", severity: "info" as const, date: "21/04/2026", icon: Monitor },
  { id: 4, title: "סיום תקופת ניסיון - אמיר בן דוד", category: "עובדים", severity: "info" as const, date: "01/05/2026", icon: FileText },
  { id: 5, title: "מלאי קסדות בטיחות מתחת למינימום (3)", category: "בטיחות", severity: "critical" as const, date: "היום", icon: Shield },
  { id: 6, title: "טסט רכב 45-678-90 פג!", category: "רכבים", severity: "critical" as const, date: "פג!", icon: Car },
  { id: 7, title: "חידוש רישיון Revit - עמדה 1", category: "תוכנה", severity: "info" as const, date: "10/05/2026", icon: Monitor },
  { id: 8, title: "פקיעת אחריות מד לייזר Leica BLK", category: "ציוד מדידה", severity: "warning" as const, date: "15/05/2026", icon: AlertTriangle },
];

const severityStyle = {
  critical: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  info: "border-info/30 bg-info/5",
};

const severityBadge = {
  critical: "bg-destructive text-destructive-foreground",
  warning: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
};

const severityLabel = {
  critical: "קריטי",
  warning: "אזהרה",
  info: "מידע",
};

export default function Alerts() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">התראות</h1>
        <p className="page-subtitle">{alerts.length} התראות פעילות • {alerts.filter(a => a.severity === "critical").length} קריטיות</p>
      </div>

      <div className="space-y-3">
        {alerts
          .sort((a, b) => {
            const order = { critical: 0, warning: 1, info: 2 };
            return order[a.severity] - order[b.severity];
          })
          .map((alert) => (
          <div
            key={alert.id}
            className={`bg-card rounded-xl border p-4 flex items-center gap-4 transition-colors hover:shadow-md ${severityStyle[alert.severity]}`}
          >
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <alert.icon className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{alert.category}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityBadge[alert.severity]}`}>
                {severityLabel[alert.severity]}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {alert.date}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
