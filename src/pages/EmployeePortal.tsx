import { useState } from "react";
import { 
  Package, Clock, Megaphone, BookOpen, Phone, ExternalLink,
  Car, Monitor, Smartphone, Wrench, Wifi, HardDrive, Mail,
  FileText, CalendarDays, AlertCircle, ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const portalTabs = [
  { id: "assets", label: "הציוד שלי", icon: Package },
  { id: "attendance", label: "נוכחות", icon: Clock },
  { id: "hr", label: "שכר וחופשות", icon: FileText },
  { id: "news", label: "הודעות", icon: Megaphone },
  { id: "kb", label: "נהלים", icon: BookOpen },
  { id: "contacts", label: "אנשי קשר", icon: Phone },
];

const myAssets = [
  { name: 'מחשב נייד Dell Latitude 15"', id: "LAP-089", icon: Monitor },
  { name: "iPhone 15 Pro", id: "PHN-034", icon: Smartphone },
  { name: "טויוטה קורולה 2023 (12-345-67)", id: "CAR-012", icon: Car },
  { name: "מד לייזר Leica", id: "MES-007", icon: Wrench },
];

const myDigital = [
  { name: "david.cohen@company.co.il", type: "דוא\"ל", icon: Mail },
  { name: "VPN - גישה מלאה", type: "VPN", icon: Wifi },
  { name: "כונן פרויקטים TLV-Tower", type: "כונן רשת", icon: HardDrive },
];

const attendance = [
  { date: "07/04/2026", inTime: "08:12", outTime: "17:45", hours: "9:33", source: "משרד" },
  { date: "06/04/2026", inTime: "07:55", outTime: "18:10", hours: "10:15", source: "שטח" },
  { date: "03/04/2026", inTime: "08:30", outTime: "17:00", hours: "8:30", source: "משרד" },
  { date: "02/04/2026", inTime: "07:45", outTime: "16:30", hours: "8:45", source: "שטח" },
  { date: "01/04/2026", inTime: "08:00", outTime: "17:15", hours: "9:15", source: "משרד" },
];

const news = [
  { title: "עדכון נהלי בטיחות באתרי בנייה", date: "05/04/2026", content: "נא לעיין בנוהל המעודכן באזור הנהלים." },
  { title: "אירוע חברה - Q2 Kickoff", date: "03/04/2026", content: "אירוע רבעוני ביום חמישי 17/04 בשעה 18:00." },
  { title: "שדרוג מערכת VPN", date: "01/04/2026", content: "השדרוג יתבצע ביום שישי 11/04. צפויה הפסקת שירות קצרה." },
];

const quickLinks = [
  { label: "CRM", url: "#" },
  { label: "פורטל ממשלתי", url: "#" },
  { label: "מערכת שרטוטים", url: "#" },
  { label: "מערכת דיווח שעות", url: "#" },
];

export default function EmployeePortal() {
  const [activeTab, setActiveTab] = useState("assets");

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Portal header */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center">
            <span className="text-xl font-bold text-primary-foreground">דכ</span>
          </div>
          <div>
            <h1 className="text-xl font-bold">שלום, דוד 👋</h1>
            <p className="text-sm text-muted-foreground">מנהל פרויקט • מחלקת הנדסה</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/50 overflow-x-auto">
          {quickLinks.map((link) => (
            <a
              key={link.label}
              href={link.url}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3 h-3" />
              {link.label}
            </a>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {portalTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
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

      {/* Tab content */}
      {activeTab === "assets" && (
        <div className="space-y-4 animate-fade-in">
          <h2 className="font-semibold">ציוד פיזי</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myAssets.map((asset) => (
              <div key={asset.id} className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <asset.icon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">{asset.id}</p>
                </div>
              </div>
            ))}
          </div>

          <h2 className="font-semibold mt-6">הרשאות ומערכות</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myDigital.map((item, i) => (
              <div key={i} className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-info" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.type}</p>
                </div>
              </div>
            ))}
          </div>

          <Button variant="outline" className="gap-2 mt-4">
            <AlertCircle className="w-4 h-4" />
            דווח על ציוד תקול / בקשה לציוד חדש
          </Button>
        </div>
      )}

      {activeTab === "attendance" && (
        <div className="animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">דוח נוכחות - אפריל 2026</h2>
            <Button variant="outline" size="sm" className="gap-2 text-xs">
              <AlertCircle className="w-3 h-3" />
              דווח על טעות מול מנהל
            </Button>
          </div>
          <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>כניסה</th>
                  <th>יציאה</th>
                  <th>סה"כ שעות</th>
                  <th>מקור דיווח</th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((row, i) => (
                  <tr key={i}>
                    <td>{row.date}</td>
                    <td className="font-mono text-sm">{row.inTime}</td>
                    <td className="font-mono text-sm">{row.outTime}</td>
                    <td className="font-mono text-sm font-medium">{row.hours}</td>
                    <td>
                      <span className={cn(
                        "status-badge",
                        row.source === "משרד" ? "status-active" : "status-onboarding"
                      )}>
                        {row.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            נתוני הנוכחות הם לקריאה בלבד ואינם ניתנים לעריכה
          </p>
        </div>
      )}

      {activeTab === "hr" && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border/50 p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                יתרות חופשה ומחלה
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">ימי חופשה</span>
                  <span className="text-lg font-bold text-primary">12.5</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">ימי מחלה</span>
                  <span className="text-lg font-bold text-info">18</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">* לקריאה בלבד. בקשות חופשה יש להגיש במערכת הקיימת.</p>
            </div>

            <div className="bg-card rounded-xl border border-border/50 p-5">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                תלושי שכר
              </h3>
              <div className="space-y-2">
                {["מרץ 2026", "פברואר 2026", "ינואר 2026"].map((month) => (
                  <div key={month} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">{month}</span>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                      <FileText className="w-3 h-3" />
                      הורדה
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "news" && (
        <div className="space-y-3 animate-fade-in">
          {news.map((item, i) => (
            <div key={i} className="bg-card rounded-xl border border-border/50 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm">{item.title}</h3>
                <span className="text-xs text-muted-foreground">{item.date}</span>
              </div>
              <p className="text-sm text-muted-foreground">{item.content}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === "kb" && (
        <div className="space-y-3 animate-fade-in">
          {["נוהל בטיחות באתרי בנייה", "מדריך דיווח שעות", "נוהל שימוש ברכב חברה", "מדיניות אבטחת מידע", "נוהל החזרת ציוד"].map((doc) => (
            <div key={doc} className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4 hover:bg-muted/30 cursor-pointer transition-colors">
              <BookOpen className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">{doc}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === "contacts" && (
        <div className="space-y-3 animate-fade-in">
          {[
            { name: "נועה ישראלי", role: "מנהלת HR", dept: "משאבי אנוש", phone: "050-9876543" },
            { name: "משה אברהם", role: "טכנאי מערכות", dept: "IT", phone: "050-1112233" },
            { name: "יעל לוי", role: "סוכנת שטח", dept: "מכירות", phone: "050-4455667" },
          ].map((contact) => (
            <div key={contact.name} className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">{contact.name[0]}</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{contact.name}</p>
                <p className="text-xs text-muted-foreground">{contact.role} • {contact.dept}</p>
              </div>
              <a href={`tel:${contact.phone}`} className="text-xs text-primary hover:underline font-mono">{contact.phone}</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
