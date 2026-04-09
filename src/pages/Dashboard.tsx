import { 
  Users, Package, AlertTriangle, Shield, TrendingUp, 
  UserMinus, Wrench, Car, Smartphone, Monitor, Clock
} from "lucide-react";
import { Link } from "react-router-dom";

const stats = [
  { label: "עובדים פעילים", value: "127", icon: Users, color: "text-primary", bg: "bg-primary/10", change: "+3 החודש" },
  { label: "פריטי ציוד", value: "843", icon: Package, color: "text-info", bg: "bg-info/10", change: "12 במלאי" },
  { label: "התראות פתוחות", value: "8", icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", change: "3 דחופות" },
  { label: "משימות IT פתוחות", value: "5", icon: Shield, color: "text-destructive", bg: "bg-destructive/10", change: "2 עזיבות" },
];

const recentActions = [
  { action: "העברת רכב מ-דוד כהן ל-יעל לוי", time: "לפני 12 דקות", icon: Car },
  { action: "קליטת עובד חדש: משה אברהם", time: "לפני שעה", icon: Users },
  { action: "ביטול הרשאות VPN - רונית שמש", time: "לפני 2 שעות", icon: Shield },
  { action: "הוספת מכשיר נייד לשרה דוד", time: "לפני 3 שעות", icon: Smartphone },
  { action: "עדכון טסט רכב 12-345-67", time: "אתמול", icon: Wrench },
];

const upcomingAlerts = [
  { title: "טסט רכב 23-456-78", date: "בעוד 5 ימים", severity: "warning" as const },
  { title: "חידוש רישיון AutoCAD", date: "בעוד 12 יום", severity: "info" as const },
  { title: "פקיעת ביטוח רכב 34-567-89", date: "בעוד 18 יום", severity: "warning" as const },
  { title: "סיום תקופת ניסיון - אמיר בן דוד", date: "בעוד 22 יום", severity: "info" as const },
];

const leavingEmployees = [
  { name: "רונית שמש", department: "שיווק", endDate: "15/02/2026", progress: 60 },
  { name: "עמוס גולן", department: "הנדסה", endDate: "20/02/2026", progress: 25 },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">לוח בקרה</h1>
        <p className="page-subtitle">סקירה כללית של משאבי החברה • עדכון אחרון: היום, 09:42</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="kpi-number mt-1">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  {stat.change}
                </p>
              </div>
              <div className={`${stat.bg} ${stat.color} p-2.5 rounded-lg`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-card rounded-xl border border-border/50 shadow-card">
          <div className="p-5 border-b border-border/50 flex items-center justify-between">
            <h2 className="font-semibold">פעילות אחרונה</h2>
            <Link to="/employees" className="text-xs text-primary hover:underline">הצג הכל</Link>
          </div>
          <div className="divide-y divide-border/50">
            {recentActions.map((item, i) => (
              <div key={i} className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{item.action}</p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar: Alerts + Leaving */}
        <div className="space-y-6">
          {/* Upcoming alerts */}
          <div className="bg-card rounded-xl border border-border/50 shadow-card">
            <div className="p-5 border-b border-border/50 flex items-center justify-between">
              <h2 className="font-semibold">התראות קרובות</h2>
              <Link to="/alerts" className="text-xs text-primary hover:underline">הכל</Link>
            </div>
            <div className="divide-y divide-border/50">
              {upcomingAlerts.map((alert, i) => (
                <div key={i} className="p-4 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${
                    alert.severity === "warning" ? "bg-warning" : "bg-info"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Leaving employees */}
          <div className="bg-card rounded-xl border border-destructive/20 shadow-card">
            <div className="p-5 border-b border-destructive/20 flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-destructive" />
              <h2 className="font-semibold text-destructive">עובדים בתהליך עזיבה</h2>
            </div>
            <div className="divide-y divide-border/50">
              {leavingEmployees.map((emp, i) => (
                <div key={i} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium">{emp.name}</p>
                      <p className="text-xs text-muted-foreground">{emp.department} • סיום: {emp.endDate}</p>
                    </div>
                    <span className="text-xs font-medium text-destructive">{emp.progress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-destructive rounded-full h-1.5 transition-all"
                      style={{ width: `${emp.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asset distribution */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <h2 className="font-semibold mb-4">התפלגות ציוד לפי קטגוריה</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[
            { label: "רכבים", count: 45, icon: Car, color: "text-primary bg-primary/10" },
            { label: "מחשבים ניידים", count: 132, icon: Monitor, color: "text-info bg-info/10" },
            { label: "סמארטפונים", count: 98, icon: Smartphone, color: "text-success bg-success/10" },
            { label: "ציוד מדידה", count: 67, icon: Wrench, color: "text-warning bg-warning/10" },
            { label: "רחפנים", count: 12, icon: Package, color: "text-accent-foreground bg-accent" },
            { label: "ציוד בטיחות", count: 489, icon: Shield, color: "text-destructive bg-destructive/10" },
          ].map((cat) => (
            <div key={cat.label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors cursor-pointer">
              <div className={`p-3 rounded-xl ${cat.color}`}>
                <cat.icon className="w-5 h-5" />
              </div>
              <span className="text-lg font-bold">{cat.count}</span>
              <span className="text-xs text-muted-foreground">{cat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
