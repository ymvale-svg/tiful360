import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon, Bell, Shield, Database, Users,
  Building2, Save, Upload, Smartphone, FileText, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PortalSettingsTab } from "@/components/PortalSettingsTab";
import { PayslipsUploadDialog } from "@/components/PayslipsUploadDialog";
import { usePayslipBatches } from "@/hooks/usePayslips";

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
          <TabsTrigger value="portal" className="gap-1.5">
            <Smartphone className="w-4 h-4" />
            פורטל עובדים
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-1.5">
            <Bell className="w-4 h-4" />
            חוקי התראות
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-1.5">
            <FileText className="w-4 h-4" />
            שכר ותלושים
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>

        <TabsContent value="portal">
          <PortalSettingsTab />
        </TabsContent>

        <TabsContent value="alerts">
          <AlertRulesSettings />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollSettings />
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
  const [name, setName] = useState(activeCompany?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(activeCompany?.logo_url ?? "");
  const [payrollEmails, setPayrollEmails] = useState("");

  // Load full company (including payroll_emails)
  const { data: companyFull } = useQuery({
    queryKey: ["company-full", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const { data } = await supabase.from("companies").select("*").eq("id", activeCompanyId).single();
      return data;
    },
    enabled: !!activeCompanyId,
  });

  useState(() => {
    setName(activeCompany?.name ?? "");
    setLogoUrl(activeCompany?.logo_url ?? "");
  });

  // Sync payroll_emails when loaded
  if (companyFull && payrollEmails === "" && (companyFull as any).payroll_emails) {
    setPayrollEmails((companyFull as any).payroll_emails);
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      // Validate payroll emails
      const emailsList = payrollEmails.split(",").map((s) => s.trim()).filter(Boolean);
      const invalid = emailsList.filter((e) => !/^\S+@\S+\.\S+$/.test(e));
      if (invalid.length > 0) throw new Error(`כתובות לא תקינות: ${invalid.join(", ")}`);

      const { error } = await supabase
        .from("companies")
        .update({
          name,
          logo_url: logoUrl || null,
          payroll_emails: emailsList.length > 0 ? emailsList.join(",") : null,
        })
        .eq("id", activeCompanyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      queryClient.invalidateQueries({ queryKey: ["company-full"] });
      toast({ title: "הגדרות נשמרו בהצלחה" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

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
        <label className="text-sm font-medium mb-1.5 block">כתובת לוגו (URL)</label>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          dir="ltr"
        />
        {logoUrl && (
          <div className="mt-2 w-16 h-16 rounded-lg border border-border/50 overflow-hidden bg-muted flex items-center justify-center">
            <img src={logoUrl} alt="לוגו" className="max-w-full max-h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium mb-1.5 block">כתובות אימייל מחלקת שכר</label>
        <input
          value={payrollEmails}
          onChange={(e) => setPayrollEmails(e.target.value)}
          placeholder="payroll@company.com, hr@company.com"
          className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono"
          dir="ltr"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          ניתן להזין מספר כתובות מופרדות בפסיק. אישורי בקשות חופשה/מחלה יישלחו אוטומטית לכתובות אלו.
        </p>
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

// ============================
// Payroll & Payslips Settings
// ============================
function PayrollSettings() {
  const { activeCompanyId } = useCompany();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { data: batches, isLoading } = usePayslipBatches();
  const { toast } = useToast();

  const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  const exportMissingMichpalCodes = async () => {
    if (!activeCompanyId) return;
    const { data } = await supabase
      .from("employees")
      .select("employee_code, full_name, id_number, michpal_code")
      .eq("company_id", activeCompanyId)
      .is("michpal_code", null);
    if (!data || data.length === 0) {
      toast({ title: "כל העובדים כבר משויכים למספר מיכפל" });
      return;
    }
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(data.map((e: any) => ({
      "מס׳ עובד": e.employee_code,
      "שם מלא": e.full_name,
      "ת.ז.": e.id_number,
      "מספר מיכפל (למילוי)": "",
    })));
    const wb = XLSX.utils.book_new();
    wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "עובדים ללא מיכפל");
    XLSX.writeFile(wb, "עובדים_ללא_מספר_מיכפל.xlsx");
  };

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">תלושי שכר חודשיים</h3>
              <p className="text-xs text-muted-foreground mt-0.5">העלאת קובץ PDF מאוחד מ-מיכפל ופיצול אוטומטי לעובדים</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={exportMissingMichpalCodes}>
              <Download className="w-4 h-4" />
              ייצא חסרי מיכפל
            </Button>
            <Button className="gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload className="w-4 h-4" />
              העלה תלושים
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>תקופה</th>
                <th>קובץ</th>
                <th>סה"כ עמודים</th>
                <th>הותאמו</th>
                <th>לא הותאמו</th>
                <th>נכשלו</th>
                <th>תאריך העלאה</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">טוען...</td></tr>}
              {!isLoading && (batches?.length ?? 0) === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground">עדיין לא הועלו תלושים</td></tr>
              )}
              {batches?.map((b: any) => (
                <tr key={b.id}>
                  <td className="font-medium">{MONTHS[b.period_month - 1]} {b.period_year}</td>
                  <td className="text-xs text-muted-foreground">{b.original_filename ?? "—"}</td>
                  <td className="font-mono">{b.total_pages}</td>
                  <td className="font-mono text-success">{b.matched_count}</td>
                  <td className="font-mono text-warning">{b.unmatched_count}</td>
                  <td className="font-mono text-destructive">{b.failed_count}</td>
                  <td className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("he-IL")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PayslipsUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}

