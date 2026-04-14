import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Package, Clock, Megaphone, BookOpen, Phone, ExternalLink,
  Car, Monitor, Smartphone, Wrench, Wifi, HardDrive, Mail,
  FileText, CalendarDays, AlertCircle, LogOut, Cake, PartyPopper
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

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

export default function EmployeePortal() {
  const [activeTab, setActiveTab] = useState("assets");
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const { activeCompanyId } = useCompany();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const displayName = profile?.display_name || user?.email?.split("@")[0] || "עובד";
  const initials = displayName.split(" ").map(w => w[0]).join("").slice(0, 2);

  // Fetch portal links from DB
  const { data: portalLinks = [] } = useQuery({
    queryKey: ["portal_links", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("portal_links")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  // Fetch portal contacts from DB
  const { data: portalContacts = [] } = useQuery({
    queryKey: ["portal_contacts", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("portal_contacts")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  // Fetch announcements from DB
  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("published_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  // Fetch birthday employees this month
  const { data: birthdayEmployees = [] } = useQuery({
    queryKey: ["birthdays", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const now = new Date();
      const month = now.getMonth() + 1;
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, birth_date")
        .eq("company_id", activeCompanyId)
        .eq("status", "active")
        .not("birth_date", "is", null);
      if (error) throw error;
      return (data || []).filter(emp => {
        if (!emp.birth_date) return false;
        const bd = new Date(emp.birth_date);
        return bd.getMonth() + 1 === month;
      });
    },
    enabled: !!activeCompanyId,
  });

  // Fetch knowledge base
  const { data: knowledgeBase = [] } = useQuery({
    queryKey: ["knowledge_base", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!activeCompanyId,
  });

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Mobile-friendly top bar */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary-foreground">{initials}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">שלום, {displayName.split(" ")[0]} 👋</p>
            <p className="text-[11px] text-muted-foreground">פורטל עובדים</p>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground shrink-0"
          title="יציאה"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4 overflow-x-hidden">
        {/* Announcements & Birthdays card */}
        <div className="space-y-3">
          {/* Birthday greetings */}
          {birthdayEmployees.length > 0 && (
            <div className="bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl border border-amber-200/50 dark:border-amber-800/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Cake className="w-4 h-4 text-amber-600" />
                <h3 className="font-semibold text-sm text-amber-800 dark:text-amber-300">🎂 ימי הולדת החודש</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {birthdayEmployees.map((emp) => {
                  const bd = new Date(emp.birth_date!);
                  return (
                    <div key={emp.id} className="flex items-center gap-1.5 bg-white/60 dark:bg-white/10 rounded-lg px-3 py-1.5">
                      <PartyPopper className="w-3.5 h-3.5 text-amber-600" />
                      <span className="text-xs font-medium">{emp.full_name}</span>
                      <span className="text-[10px] text-muted-foreground">({bd.getDate()}/{bd.getMonth() + 1})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Latest announcement */}
          {announcements.length > 0 && (
            <div className="bg-card rounded-xl border border-border/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">הודעות חברה</h3>
              </div>
              <div className="space-y-2">
                {announcements.slice(0, 2).map((ann) => (
                  <div key={ann.id} className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-medium">{ann.title}</p>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(ann.published_at).toLocaleDateString("he-IL")}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{ann.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick links - wrapping grid instead of scroll */}
        {portalLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {portalLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border/50 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Tabs - wrapping grid for mobile */}
        <div className="grid grid-cols-3 gap-1.5">
          {portalTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[11px] font-medium transition-colors",
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
            <h2 className="font-semibold text-sm">ציוד פיזי</h2>
            <div className="grid grid-cols-1 gap-3">
              {myAssets.map((asset) => (
                <div key={asset.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <asset.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">{asset.id}</p>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="font-semibold text-sm mt-6">הרשאות ומערכות</h2>
            <div className="grid grid-cols-1 gap-3">
              {myDigital.map((item, i) => (
                <div key={i} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.type}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" className="gap-2 w-full text-sm">
              <AlertCircle className="w-4 h-4" />
              דווח על ציוד תקול / בקשה לציוד חדש
            </Button>
          </div>
        )}

        {activeTab === "attendance" && (
          <div className="animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">נוכחות - אפריל 2026</h2>
              <Button variant="outline" size="sm" className="gap-1 text-[11px]">
                <AlertCircle className="w-3 h-3" />
                דווח טעות
              </Button>
            </div>

            <div className="space-y-2">
              {attendance.map((row, i) => (
                <div key={i} className="bg-card rounded-xl border border-border/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{row.date}</span>
                    <span className={cn(
                      "text-[11px] px-2 py-0.5 rounded-full font-medium",
                      row.source === "משרד" 
                        ? "bg-primary/10 text-primary" 
                        : "bg-accent text-accent-foreground"
                    )}>
                      {row.source}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    <span>כניסה: <span className="font-mono text-foreground">{row.inTime}</span></span>
                    <span>יציאה: <span className="font-mono text-foreground">{row.outTime}</span></span>
                    <span className="font-semibold text-foreground">{row.hours} שעות</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              נתוני הנוכחות הם לקריאה בלבד
            </p>
          </div>
        )}

        {activeTab === "hr" && (
          <div className="space-y-4 animate-fade-in">
            <div className="bg-card rounded-xl border border-border/50 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                יתרות חופשה ומחלה
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-2xl font-bold text-primary">12.5</span>
                  <span className="text-[11px] text-muted-foreground">ימי חופשה</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-2xl font-bold text-primary">18</span>
                  <span className="text-[11px] text-muted-foreground">ימי מחלה</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">* לקריאה בלבד</p>
            </div>

            <div className="bg-card rounded-xl border border-border/50 p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                תלושי שכר
              </h3>
              <div className="space-y-2">
                {["מרץ 2026", "פברואר 2026", "ינואר 2026"].map((month) => (
                  <div key={month} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm">{month}</span>
                    <Button variant="ghost" size="sm" className="text-xs gap-1 h-8">
                      <FileText className="w-3 h-3" />
                      הורדה
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "news" && (
          <div className="space-y-3 animate-fade-in">
            {announcements.length > 0 ? announcements.map((item) => (
              <div key={item.id} className="bg-card rounded-xl border border-border/50 p-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(item.published_at).toLocaleDateString("he-IL")}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{item.content}</p>
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין הודעות כרגע</p>
            )}
          </div>
        )}

        {activeTab === "kb" && (
          <div className="space-y-2 animate-fade-in">
            {knowledgeBase.length > 0 ? knowledgeBase.map((doc) => (
              <div key={doc.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3 hover:bg-muted/30 cursor-pointer transition-colors active:scale-[0.98]">
                <BookOpen className="w-5 h-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{doc.title}</span>
                  {doc.category && <span className="text-[10px] text-muted-foreground">{doc.category}</span>}
                </div>
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין נהלים כרגע</p>
            )}
          </div>
        )}

        {activeTab === "contacts" && (
          <div className="space-y-2 animate-fade-in">
            {portalContacts.length > 0 ? portalContacts.map((contact) => (
              <div key={contact.id} className="bg-card rounded-xl border border-border/50 p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-bold text-primary">{contact.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  <p className="text-[11px] text-muted-foreground">{contact.role} • {contact.department}</p>
                </div>
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0">
                  <Phone className="w-3.5 h-3.5" />
                </a>
              </div>
            )) : (
              <p className="text-center text-sm text-muted-foreground py-8">אין אנשי קשר כרגע</p>
            )}
          </div>
        )}

        {/* Bottom safe area */}
        <div className="h-6" />
      </div>
    </div>
  );
}
