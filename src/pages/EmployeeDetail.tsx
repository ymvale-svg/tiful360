import { useParams, Link } from "react-router-dom";
import { 
  ArrowRight, Car, Monitor, Smartphone, Wrench, Shield, 
  Key, HardDrive, Mail, Wifi, Clock, AlertTriangle, UserMinus, 
  FileText, RefreshCw, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "assets", label: "משאבים חומריים", icon: Package },
  { id: "digital", label: "הרשאות דיגיטליות", icon: Key },
  { id: "history", label: "היסטוריית פעילות", icon: Clock },
];

const employeeAssets = [
  { id: "CAR-012", category: "רכב", name: "טויוטה קורולה 2023", details: "12-345-67", icon: Car, status: "בשימוש", testDate: "15/08/2026" },
  { id: "LAP-089", category: "מחשב נייד", name: 'Dell Latitude 15"', details: "SN: DL89012345", icon: Monitor, status: "בשימוש", testDate: null },
  { id: "PHN-034", category: "סמארטפון", name: "iPhone 15 Pro", details: "050-1234567", icon: Smartphone, status: "בשימוש", testDate: null },
  { id: "MES-007", category: "ציוד מדידה", name: "מד לייזר Leica", details: "SN: LC7890", icon: Wrench, status: "בשימוש", testDate: null },
];

const digitalAccess = [
  { type: "תיבת דוא\"ל", resource: "david.cohen@company.co.il", permission: "מנהל", icon: Mail, status: "פעיל" },
  { type: "VPN", resource: "vpn.company.co.il", permission: "גישה מלאה", icon: Wifi, status: "פעיל" },
  { type: "כונן רשת", resource: "\\\\server\\projects\\TLV-Tower", permission: "עריכה", icon: HardDrive, status: "פעיל" },
  { type: "כונן רשת", resource: "\\\\server\\projects\\Haifa-Mall", permission: "קריאה", icon: HardDrive, status: "פעיל" },
  { type: "CRM", resource: "Salesforce - צוות מכירות", permission: "עריכה", icon: Shield, status: "פעיל" },
];

const activityLog = [
  { date: "07/04/2026", action: "העברת רכב CAR-012 מעמוס גולן", user: "מנהל תפעול", type: "transfer" },
  { date: "01/04/2026", action: "הוספת גישה לכונן פרויקט חיפה", user: "צוות IT", type: "access" },
  { date: "15/03/2026", action: "חידוש רישיון AutoCAD", user: "מנהל תפעול", type: "renewal" },
  { date: "01/03/2026", action: "הקצאת iPhone 15 Pro", user: "מנהל תפעול", type: "assign" },
  { date: "12/01/2026", action: "עדכון הרשאות VPN - גישה מלאה", user: "צוות IT", type: "access" },
  { date: "12/03/2021", action: "קליטת עובד - פתיחת תיק", user: "מערכת", type: "system" },
];

export default function EmployeeDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("assets");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/employees" className="hover:text-foreground transition-colors">עובדים</Link>
        <ArrowRight className="w-3 h-3 rotate-180" />
        <span className="text-foreground font-medium">דוד כהן</span>
      </div>

      {/* Employee Header */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">דכ</span>
            </div>
            <div>
              <h1 className="text-xl font-bold">דוד כהן</h1>
              <p className="text-sm text-muted-foreground mt-0.5">מנהל פרויקט • מחלקת הנדסה</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="status-badge status-active">פעיל</span>
                <span className="text-xs text-muted-foreground">ת.ז: 301234567</span>
                <span className="text-xs text-muted-foreground">מזהה: {id}</span>
                <span className="text-xs text-muted-foreground">תחילת עבודה: 12/03/2021</span>
              </div>
            </div>
          </div>

          <Button variant="destructive" className="gap-2">
            <UserMinus className="w-4 h-4" />
            התנעת עזיבה
          </Button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-4 mt-6 pt-5 border-t border-border/50">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">{employeeAssets.length}</p>
            <p className="text-xs text-muted-foreground mt-1">פריטי ציוד</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-info">{digitalAccess.length}</p>
            <p className="text-xs text-muted-foreground mt-1">הרשאות דיגיטליות</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-success">4.8</p>
            <p className="text-xs text-muted-foreground mt-1">שנות ותק</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-foreground">{activityLog.length}</p>
            <p className="text-xs text-muted-foreground mt-1">פעולות בהיסטוריה</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "assets" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {employeeAssets.map((asset) => (
            <div key={asset.id} className="bg-card rounded-xl border border-border/50 shadow-card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <asset.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{asset.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{asset.category} • {asset.id}</p>
                    <p className="text-xs text-muted-foreground">{asset.details}</p>
                  </div>
                </div>
                <span className="status-badge status-active">{asset.status}</span>
              </div>
              {asset.testDate && (
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3 h-3 text-warning" />
                  <span>טסט הבא: {asset.testDate}</span>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <RefreshCw className="w-3 h-3" />
                  העבר בעלות
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <FileText className="w-3 h-3" />
                  פרטים
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "digital" && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden animate-fade-in">
          <table className="data-table">
            <thead>
              <tr>
                <th>סוג גישה</th>
                <th>משאב</th>
                <th>רמת הרשאה</th>
                <th>סטטוס</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {digitalAccess.map((access, i) => (
                <tr key={i}>
                  <td className="flex items-center gap-2">
                    <access.icon className="w-4 h-4 text-muted-foreground" />
                    {access.type}
                  </td>
                  <td className="font-mono text-xs">{access.resource}</td>
                  <td>{access.permission}</td>
                  <td><span className="status-badge status-active">{access.status}</span></td>
                  <td>
                    <Button variant="ghost" size="sm" className="text-xs text-destructive hover:text-destructive">
                      השהה
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 animate-fade-in">
          <div className="relative">
            <div className="absolute top-0 bottom-0 right-[17px] w-0.5 bg-border" />
            <div className="space-y-6">
              {activityLog.map((item, i) => (
                <div key={i} className="flex items-start gap-5 relative">
                  <div className="timeline-dot mt-1 z-10 shrink-0" />
                  <div className="flex-1 pb-2">
                    <p className="text-sm">{item.action}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{item.date}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{item.user}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
