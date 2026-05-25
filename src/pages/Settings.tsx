import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon, Bell, Shield, Database, Users,
  Building2, Save, Smartphone, Upload, Trash2, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalSettingsTab } from "@/components/PortalSettingsTab";
import { SubEmployersTab } from "@/components/SubEmployersTab";
import { EmailTemplatesTab } from "@/components/EmailTemplatesTab";
import { ProtocolTemplatesTab } from "@/components/settings/ProtocolTemplatesTab";
import { Mail } from "lucide-react";

// ============================
// Generic Emails Settings (per column)
// ============================
function EmailsSettings({
  columnKey, title, description, placeholder,
}: { columnKey: "it_emails" | "expiry_notification_emails" | "operations_emails" | "payroll_emails"; title: string; description: string; placeholder: string }) {
  const { activeCompanyId, activeCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState((activeCompany as any)?.[columnKey] ?? "");

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { error } = await supabase
        .from("companies")
        .update({ [columnKey]: emails || null } as any)
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "נמענים נשמרו בהצלחה" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  if (!activeCompanyId) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Mail className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div>
        <label className="text-sm font-medium mb-1.5 block">כתובות דוא"ל</label>
        <input
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          dir="ltr"
        />
      </div>
      <Button className="gap-1.5" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
        <Save className="w-4 h-4" />
        {updateMutation.isPending ? "שומר..." : "שמור שינויים"}
      </Button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();

  const shortcuts = [
    { icon: Database, title: "מחולל קטגוריות", desc: "הוספה ועריכת סוגי ציוד", path: "/categories" },
    { icon: Users, title: "ניהול משתמשים", desc: "הוספת מנהלי מערכת", path: "/user-management" },
    { icon: Shield, title: "ניהול חברות", desc: "ניהול חברות במערכת", path: "/companies" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">הגדרות</h1>
        <p className="page-subtitle">ניהול הגדרות המערכת, התראות ואבטחה</p>
      </div>

      <Tabs defaultValue="general" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="general" className="gap-1.5">
            <SettingsIcon className="w-4 h-4" />
            כללי
          </TabsTrigger>
          <TabsTrigger value="sub_employers" className="gap-1.5">
            <Building2 className="w-4 h-4" />
            מעסיקים / תת-חברות
          </TabsTrigger>
          <TabsTrigger value="portal" className="gap-1.5">
            <Smartphone className="w-4 h-4" />
            פורטל עובדים
          </TabsTrigger>
          <TabsTrigger value="email_templates" className="gap-1.5">
            <Mail className="w-4 h-4" />
            תבניות מייל
          </TabsTrigger>
          <TabsTrigger value="protocols" className="gap-1.5">
            <FileText className="w-4 h-4" />
            פרוטוקולי מסירה
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="w-4 h-4" />
            חוקי התראות
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="sub_employers">
          <SubEmployersTab />
        </TabsContent>

        <TabsContent value="portal">
          <PortalSettingsTab />
          <div className="mt-6 space-y-6">
            <EmailsSettings
              columnKey="it_emails"
              title='נמענים להתראות IT'
              description='כתובות דוא"ל שיקבלו התראה בעת פתיחת קריאת IT חדשה (מופרדות בפסיק)'
              placeholder="it@company.com, ops@company.com"
            />
            <EmailsSettings
              columnKey="expiry_notification_emails"
              title="נמענים להתראות תפוגה"
              description='כתובות דוא"ל שיקבלו סיכום יומי של ציוד שמתקרב לתפוגה (מופרדות בפסיק). אם ריק - לא יישלחו התראות.'
              placeholder="ops@company.com, manager@company.com"
            />
          </div>
        </TabsContent>

        <TabsContent value="email_templates">
          <EmailTemplatesTab />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertRulesSettings />
        </TabsContent>
      </Tabs>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">קיצורים</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {shortcuts.map((item) => (
            <button
              key={item.title}
              onClick={() => navigate(item.path)}
              className="bg-card rounded-xl border border-border/50 p-4 hover:shadow-md hover:border-primary/30 transition-all text-right flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================
// General Company Settings
// ============================
function GeneralSettings() {
  const { activeCompanyId, activeCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(activeCompany?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(activeCompany?.logo_url ?? "");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(activeCompany?.name ?? "");
    setLogoUrl(activeCompany?.logo_url ?? "");
  }, [activeCompany]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { error } = await supabase
        .from("companies")
        .update({
          name,
          logo_url: logoUrl || null,
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "הגדרות נשמרו בהצלחה" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const handleUpload = async (file: File) => {
    if (!activeCompanyId) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "הקובץ גדול מדי", description: "מקסימום 5MB", variant: "destructive" });
      return;
    }
    try {
      setUploading(true);
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${activeCompanyId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("company-logos").upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase.from("companies").update({ logo_url: url }).eq("id", activeCompanyId);
      if (updErr) throw updErr;
      setLogoUrl(url);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "הלוגו הועלה בהצלחה" });
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאה", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    if (!activeCompanyId) return;
    setLogoUrl("");
    const { error } = await supabase.from("companies").update({ logo_url: null }).eq("id", activeCompanyId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["companies"] });
    toast({ title: "הלוגו הוסר" });
  };

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">פרטי החברה</h3>
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">שם החברה</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">לוגו החברה</label>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-lg border border-border/50 overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="לוגו" className="max-w-full max-h-full object-contain" />
            ) : (
              <Building2 className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="w-4 h-4" />
              {uploading ? "מעלה..." : "העלאת לוגו"}
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={removeLogo}>
                <Trash2 className="w-4 h-4" />
                הסר לוגו
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG / JPG / SVG עד 5MB. הלוגו יופיע ממורכז בתחילת מיילים שנשלחים לעובדים.</p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block">או הדבק כתובת לוגו (URL)</label>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          dir="ltr"
        />
      </div>

      <Button className="gap-1.5" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
        <Save className="w-4 h-4" />
        {updateMutation.isPending ? "שומר..." : "שמור שינויים"}
      </Button>
    </div>
  );
}

// ============================
// Alert Rules Settings
// ============================
function AlertRulesSettings() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();

  const [rules, setRules] = useState([
    { id: "expiry", label: "התראה על ציוד שפג תוקפו", desc: "שלח התראה 30 יום לפני תפוגת ציוד", enabled: true },
    { id: "leaving", label: "התראה על עובד עוזב", desc: "הצג התראה כשעובד עובר לסטטוס ׳עוזב׳", enabled: true },
    { id: "unassigned", label: "ציוד ללא שיוך", desc: "הצג ציוד שנמצא במלאי מעל 60 יום", enabled: false },
    { id: "license", label: "חידוש רישיונות", desc: "תזכורת לחידוש רישיונות תוכנה", enabled: true },
  ]);

  const toggle = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    toast({ title: "חוק עודכן" });
  };

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-3 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">חוקי התראות</h3>
      </div>
      <p className="text-xs text-muted-foreground">הגדר אילו התראות אוטומטיות יופעלו במערכת</p>

      <div className="space-y-2 mt-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background"
          >
            <div>
              <p className="text-sm font-medium">{rule.label}</p>
              <p className="text-xs text-muted-foreground">{rule.desc}</p>
            </div>
            <button
              onClick={() => toggle(rule.id)}
              className={`w-11 h-6 rounded-full transition-colors relative ${
                rule.enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  rule.enabled ? "right-0.5" : "left-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

