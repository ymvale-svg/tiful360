import { uploadFile } from "@/lib/uploadWithProgress";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FormField } from "@/components/feedback/FormField";
import { Input } from "@/components/ui/input";
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
import { GoogleCalendarSyncCard } from "@/components/settings/GoogleCalendarSyncCard";
import { SlaSettingsCard } from "@/components/settings/SlaSettingsCard";
import { Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PermissionAuditTab } from "@/components/settings/PermissionAuditTab";

// ============================
// Generic Emails Settings (per column)
// ============================
function EmailsSettings({
  columnKey, title, description, placeholder,
}: { columnKey: "it_emails" | "expiry_notification_emails" | "operations_emails" | "payroll_emails" | "secretariat_emails"; title: string; description: string; placeholder: string }) {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load current recipients via the security-definer RPC (direct column reads
  // are restricted for non-admin roles). Reload from scratch whenever the
  // active company changes so one company's addresses are never saved into another.
  useEffect(() => {
    setEmails("");
    setLoaded(false);
    if (!activeCompanyId) return;
    let cancelled = false;
    supabase
      .rpc("get_company_routing_emails", { _company_id: activeCompanyId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data && data.length > 0) {
          setEmails((data[0] as any)?.[columnKey] ?? "");
        }
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [activeCompanyId, columnKey]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { error } = await supabase.rpc("set_company_routing_emails", {
        _company_id: activeCompanyId,
        _column: columnKey,
        _emails: emails || "",
      });
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
        <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">{title}</h3>
      </div>
      <FormField label='כתובות דוא"ל' hint={description} id={`emails-${columnKey}`}>
        <Input
          type="text"
          inputMode="email"
          autoComplete="off"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={placeholder}
          disabled={!loaded}
          className="font-mono"
          dir="ltr"
        />
      </FormField>
      <Button className="gap-1.5" onClick={() => updateMutation.mutateAsync()} disabled={!loaded} loading={updateMutation.isPending} loadingText="שומר…" successText="נשמר">
        <Save className="w-4 h-4" aria-hidden="true" />
        שמור שינויים
      </Button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin, isOperations } = useAuth();
  const canManageProtocols = isAdmin || isSuperAdmin || isOperations;
  // The active tab lives in ?tab= so reloads, shared links and Back keep it.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";
  const changeTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === "general") next.delete("tab"); else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

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

      <Tabs value={activeTab} onValueChange={changeTab} dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="general" className="gap-1.5">
            <SettingsIcon className="w-4 h-4" aria-hidden="true" />
            כללי
          </TabsTrigger>
          <TabsTrigger value="sub_employers" className="gap-1.5">
            <Building2 className="w-4 h-4" aria-hidden="true" />
            מעסיקים / תת-חברות
          </TabsTrigger>
          <TabsTrigger value="portal" className="gap-1.5">
            <Smartphone className="w-4 h-4" aria-hidden="true" />
            פורטל עובדים
          </TabsTrigger>
          <TabsTrigger value="email_templates" className="gap-1.5">
            <Mail className="w-4 h-4" aria-hidden="true" />
            תבניות מייל
          </TabsTrigger>
          {canManageProtocols && (
            <TabsTrigger value="protocols" className="gap-1.5">
              <FileText className="w-4 h-4" aria-hidden="true" />
              פרוטוקולי מסירה
            </TabsTrigger>
          )}
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="w-4 h-4" aria-hidden="true" />
            חוקי התראות
          </TabsTrigger>
          {(isAdmin || isSuperAdmin) && (
            <TabsTrigger value="permission_audit" className="gap-1.5">
              <Shield className="w-4 h-4" aria-hidden="true" />
              לוג הרשאות
            </TabsTrigger>
          )}
        </TabsList>

        {(isAdmin || isSuperAdmin) && (
          <TabsContent value="permission_audit">
            <PermissionAuditTab />
          </TabsContent>
        )}

        <TabsContent value="general">
          <div className="space-y-6">
            <GeneralSettings />
            <GoogleCalendarSyncCard />
          </div>
        </TabsContent>


        <TabsContent value="sub_employers">
          <SubEmployersTab />
        </TabsContent>

        <TabsContent value="portal">
          <PortalSettingsTab />
          <div className="mt-6 space-y-6">
            <EmailsSettings
              columnKey="operations_emails"
              title="נמענים לקריאות שירות (תפעול)"
              description='כתובות דוא"ל של התפעול שיקבלו כל קריאת שירות חדשה שנפתחת (מופרדות בפסיק). עותק נשלח תמיד לפותח הקריאה.'
              placeholder="ops@company.com"
            />
            <EmailsSettings
              columnKey="it_emails"
              title='נמענים להתראות IT'
              description='כתובות דוא"ל נוספות שיקבלו התראה בעת פתיחת קריאה חדשה (מופרדות בפסיק)'
              placeholder="it@company.com, ops@company.com"
            />
            <EmailsSettings
              columnKey="secretariat_emails"
              title="נמענים לזימוני יומן (מזכירות)"
              description='כתובות דוא"ל של המזכירות שיקבלו זימון ליומן על כל חופשה / מחלה / מילואים מאושרת (מופרדות בפסיק)'
              placeholder="office@company.com"
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

        {canManageProtocols && (
          <TabsContent value="protocols">
            <ProtocolTemplatesTab />
          </TabsContent>
        )}

        <TabsContent value="alerts">
          <div className="space-y-6">
            <SlaSettingsCard />
            <AlertRulesSettings />
          </div>
        </TabsContent>
      </Tabs>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">קיצורים</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {shortcuts.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => navigate(item.path)}
              className="bg-card rounded-xl border border-border/50 p-4 hover:shadow-md hover:border-primary/30 transition-all text-right flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-primary" aria-hidden="true" />
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

  // One save model for the whole card: uploading or removing the logo only changes the draft;
  // "שמור שינויים" writes name + logo together.
  const savedName = activeCompany?.name ?? "";
  const savedLogo = activeCompany?.logo_url ?? "";
  const dirty = name !== savedName || (logoUrl || "") !== (savedLogo || "");

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
      const { error: upErr } = await uploadFile("company-logos", path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("company-logos").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast({ title: "הלוגו הועלה", description: "לחצו \"שמור שינויים\" כדי להחיל אותו." });
    } catch (e: any) {
      toast({ title: "שגיאה בהעלאה", description: e.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = () => setLogoUrl("");

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Building2 className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">פרטי החברה</h3>
      </div>
      <FormField label="שם החברה" id="company-name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
      </FormField>

      <div role="group" aria-labelledby="company-logo-label">
        <p id="company-logo-label" className="text-sm font-medium mb-1.5">לוגו החברה</p>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-lg border border-border/50 overflow-hidden bg-muted flex items-center justify-center shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="לוגו החברה" className="max-w-full max-h-full object-contain" />
            ) : (
              <Building2 className="w-8 h-8 text-muted-foreground" aria-label="אין לוגו" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              aria-label="בחירת קובץ לוגו"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileRef.current?.click()}
              loading={uploading}
              loadingText="מעלה…"
            >
              <Upload className="w-4 h-4" aria-hidden="true" />
              העלאת לוגו
            </Button>
            {logoUrl && (
              <Button type="button" variant="ghost" className="gap-1.5 text-destructive" onClick={removeLogo} disabled={uploading}>
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                הסר לוגו
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PNG / JPG / SVG עד 5MB. הלוגו יופיע ממורכז בתחילת מיילים שנשלחים לעובדים. השינוי נשמר בלחיצה על "שמור שינויים".</p>
          </div>
        </div>
      </div>

      <FormField label="או הדבק כתובת לוגו (URL)" id="company-logo-url">
        <Input
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="font-mono"
          dir="ltr"
        />
      </FormField>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="gap-1.5" onClick={() => updateMutation.mutateAsync()} disabled={uploading || !dirty} loading={updateMutation.isPending} loadingText="שומר…" successText="נשמר">
          <Save className="w-4 h-4" aria-hidden="true" />
          שמור שינויים
        </Button>
        {dirty && !updateMutation.isPending && (
          <>
            <span className="text-xs text-muted-foreground" role="status">יש שינויים שלא נשמרו</span>
            <Button type="button" variant="ghost" onClick={() => { setName(savedName); setLogoUrl(savedLogo); }} disabled={uploading}>בטל שינויים</Button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================
// Alert Rules Settings
// ============================
function AlertRulesSettings() {
  // There is no table behind these rules yet: they are fixed in the system, so
  // show them as information only instead of toggles that pretend to save.
  const rules = [
    { id: "expiry", label: "התראה על ציוד שפג תוקפו", desc: "שלח התראה 30 יום לפני תפוגת ציוד", enabled: true },
    { id: "leaving", label: "התראה על עובד עוזב", desc: "הצג התראה כשעובד עובר לסטטוס ׳עוזב׳", enabled: true },
    { id: "unassigned", label: "ציוד ללא שיוך", desc: "הצג ציוד שנמצא במלאי מעל 60 יום", enabled: false },
    { id: "license", label: "חידוש רישיונות", desc: "תזכורת לחידוש רישיונות תוכנה", enabled: true },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-3 max-w-xl">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="w-5 h-5 text-primary" aria-hidden="true" />
        <h3 className="font-semibold">חוקי התראות</h3>
      </div>
      <p className="text-xs text-muted-foreground">כללי ההתראות מוגדרים במערכת ואינם ניתנים לשינוי מכאן.</p>

      <ul className="space-y-2 mt-3">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/50 bg-background"
          >
            <div>
              <p className="text-sm font-medium">{rule.label}</p>
              <p className="text-xs text-muted-foreground">{rule.desc}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                rule.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              }`}
            >
              {rule.enabled ? "פעיל" : "כבוי"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

