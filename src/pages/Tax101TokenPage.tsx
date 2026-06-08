import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tax101Dialog } from "@/components/Tax101Dialog";
import { FileText, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Tax101TokenPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("לינק לא תקין");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data: rows, error: e1 } = await supabase.rpc("get_tax_form_101_by_token", { _token: token });
        if (e1) throw e1;
        const f = Array.isArray(rows) ? rows[0] : rows;
        if (!f) {
          setError("לא נמצא טופס או שהקישור פג תוקף");
          return;
        }
        if ((f as any).status !== "pending") {
          setError("הטופס כבר נחתם");
          setForm(f);
          return;
        }
        setForm(f);

        const [{ data: emp }, { data: co }] = await Promise.all([
          supabase.from("employees").select("*").eq("id", (f as any).employee_id).maybeSingle(),
          supabase.from("companies").select("name, logo_url").eq("id", (f as any).company_id).maybeSingle(),
        ]);
        setEmployee(emp);
        setCompany(co);
      } catch (e: any) {
        setError(e.message ?? "שגיאה");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">טוען...</span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-card rounded-2xl border border-border/50 shadow-lg p-6 space-y-4 text-center">
        {company?.logo_url && (
          <img src={company.logo_url} alt={`לוגו ${company.name ?? "החברה"}`} className="h-12 mx-auto" />
        )}
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto" aria-hidden="true">
          <FileText className="w-7 h-7 text-primary" aria-hidden="true" />
        </div>

        {error ? (
          <>
            <h1 className="text-lg font-bold flex items-center gap-2 justify-center" role="alert">
              <AlertCircle className="w-5 h-5 text-destructive" aria-hidden="true" />
              {error}
            </h1>
            {form?.pdf_url && (
              <Button
                variant="outline"
                onClick={async () => {
                  const { data, error: e } = await supabase.functions.invoke(
                    "tax-form-101-signed-url",
                    { body: { token } },
                  );
                  if (!e && data?.signedUrl) {
                    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                הצג טופס חתום
              </Button>
            )}
          </>
        ) : done ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-success mx-auto" aria-hidden="true" />
            <h1 className="text-lg font-bold">תודה!</h1>
            <p className="text-sm text-muted-foreground">הטופס נחתם ונשלח למחלקת השכר. ניתן לסגור את החלון.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">טופס 101 לשנת {form?.tax_year}</h1>
            {employee && (
              <p className="text-sm text-muted-foreground">
                שלום <span className="font-medium text-foreground">{employee.full_name}</span> <span aria-hidden="true">👋</span><br />
                לחץ למטה כדי למלא ולחתום על טופס 101 שלך {company?.name ? `עבור ${company.name}` : ""}.
              </p>
            )}
            <Button size="lg" className="w-full" onClick={() => setOpen(true)}>
              התחל למלא טופס
            </Button>
          </>
        )}
      </div>

      {form && employee && (
        <Tax101Dialog
          open={open}
          onOpenChange={setOpen}
          formId={form.id}
          taxYear={form.tax_year}
          employee={employee}
          isTokenFlow
          onSuccess={() => setDone(true)}
        />
      )}
    </main>
  );
}
