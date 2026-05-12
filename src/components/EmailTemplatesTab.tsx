import { useEffect, useState } from "react";
import { Mail, Save, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const TEMPLATE_KEY = "payslip-available";

const DEFAULT_SUBJECT = "תלוש השכר שלך לחודש {{period_label}} זמין באזור האישי";
const DEFAULT_BODY = `<div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: auto;">
  <h2 style="color: #1f2937;">שלום {{employee_name}},</h2>
  <p style="color: #374151; font-size: 15px; line-height: 1.6;">
    תלוש השכר שלך לחודש <strong>{{period_label}}</strong> מטעם <strong>{{company_name}}</strong> עלה לאזור האישי שלך.
  </p>
  <p style="margin-top: 20px;">
    <a href="{{portal_url}}" target="_blank" style="background: #1d4ed8; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">צפייה בתלוש</a>
  </p>
  <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">הודעה אוטומטית — אין צורך להשיב.</p>
</div>`;

const VARIABLES: { key: string; desc: string; sample: string }[] = [
  { key: "{{employee_name}}", desc: "שם מלא של העובד", sample: "ישראל ישראלי" },
  { key: "{{period_label}}", desc: "חודש בעברית ושנה", sample: "מאי/2026" },
  { key: "{{period_month}}", desc: "מספר החודש (1-12)", sample: "5" },
  { key: "{{period_year}}", desc: "שנה (4 ספרות)", sample: "2026" },
  { key: "{{company_name}}", desc: "שם החברה / המעסיק", sample: "חברת דוגמה בע״מ" },
  { key: "{{company_logo}}", desc: "לוגו החברה ממורכז (HTML מלא). אם לא תכלול אותו - הלוגו יוצמד אוטומטית בראש המייל", sample: '<div style="text-align:center;padding:16px 0;"><img src="https://via.placeholder.com/200x60?text=LOGO" style="max-height:80px"/></div>' },
  { key: "{{company_logo_url}}", desc: "כתובת ה-URL של לוגו החברה בלבד (לשימוש מותאם)", sample: "https://via.placeholder.com/200x60?text=LOGO" },
  { key: "{{portal_url}}", desc: "קישור לאזור האישי", sample: "https://tiful360.com/portal" },
];

function renderPreview(text: string) {
  let out = text;
  for (const v of VARIABLES) out = out.split(v.key).join(v.sample);
  return out;
}

export function EmailTemplatesTab() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [showPreview, setShowPreview] = useState(false);

  const { data: template } = useQuery({
    queryKey: ["company-email-template", activeCompanyId, TEMPLATE_KEY],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_email_templates" as any)
        .select("subject, body_html")
        .eq("company_id", activeCompanyId!)
        .eq("template_key", TEMPLATE_KEY)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { subject: string; body_html: string } | null;
    },
  });

  useEffect(() => {
    if (template) {
      setSubject(template.subject);
      setBody(template.body_html);
    } else {
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
    }
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("company_email_templates" as any)
        .upsert(
          {
            company_id: activeCompanyId,
            template_key: TEMPLATE_KEY,
            subject,
            body_html: body,
            updated_by: u?.user?.id ?? null,
          },
          { onConflict: "company_id,template_key" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-email-template"] });
      toast({ title: "התבנית נשמרה בהצלחה" });
    },
    onError: (e: any) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  if (!activeCompanyId) {
    return <div className="text-sm text-muted-foreground">בחר חברה כדי להגדיר תבניות מייל.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold">תבנית מייל — זמינות תלוש שכר</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              נוסח ההודעה הנשלחת לעובד כשתלוש השכר שלו עולה לאזור האישי.
            </p>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">נושא המייל</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} dir="rtl" />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">גוף המייל (HTML)</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            dir="ltr"
            className="min-h-[260px] font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? "שומר..." : "שמור תבנית"}
          </Button>
          <Button variant="outline" onClick={() => setShowPreview((s) => !s)} className="gap-1.5">
            <Eye className="w-4 h-4" />
            {showPreview ? "הסתר תצוגה מקדימה" : "תצוגה מקדימה"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSubject(DEFAULT_SUBJECT);
              setBody(DEFAULT_BODY);
            }}
            className="gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            שחזר ברירת מחדל
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card p-6">
        <h4 className="font-semibold text-sm mb-3">משתנים זמינים</h4>
        <p className="text-xs text-muted-foreground mb-3">
          הוסף את המשתנים בנושא או בגוף המייל — הם יוחלפו אוטומטית בערכים המתאימים בעת השליחה.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {VARIABLES.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => navigator.clipboard.writeText(v.key).then(() => toast({ title: "הועתק", description: v.key }))}
              className="text-right p-3 rounded-lg bg-muted/40 hover:bg-muted transition-colors"
            >
              <code className="text-xs font-mono text-primary">{v.key}</code>
              <div className="text-xs text-muted-foreground mt-1">{v.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {showPreview && (
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-6 space-y-3">
          <h4 className="font-semibold text-sm">תצוגה מקדימה (עם ערכים לדוגמה)</h4>
          <div className="text-xs text-muted-foreground">
            <strong>נושא:</strong> {renderPreview(subject)}
          </div>
          <div
            className="border border-border/50 rounded-lg p-4 bg-background"
            dangerouslySetInnerHTML={{ __html: renderPreview(body) }}
          />
        </div>
      )}
    </div>
  );
}
