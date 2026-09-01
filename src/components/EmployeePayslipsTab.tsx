import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeePayslips, getPayslipSignedUrl, useDeletePayslip } from "@/hooks/usePayslips";
import { Download, Calendar, TrendingUp, Stethoscope, FileText, Eye, Trash2, ShieldAlert, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PayslipSummaryDialog } from "@/components/PayslipSummaryDialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  employeeId: string;
  employee: any;
  canSeeSalary: boolean;
  hideBalances?: boolean;
  /** True only when the viewer is the employee himself. Anyone else is blocked. */
  isSelf?: boolean;
  /** Free-text context recorded in the audit email/log. */
  auditContext?: string;
}

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export function EmployeePayslipsTab({ employeeId, employee, canSeeSalary, hideBalances, isSelf, auditContext }: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  // "password" | "oauth" | null (null = still detecting)
  const [authMethod, setAuthMethod] = useState<"password" | "oauth" | null>(null);
  const { data: payslips, isLoading } = useEmployeePayslips(employeeId);
  const { toast } = useToast();
  const [summaryPayslip, setSummaryPayslip] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const deleteMutation = useDeletePayslip();

  // Re-arm the confidentiality gate whenever the viewed employee changes.
  useEffect(() => {
    setUnlocked(false);
    setPassword("");
    setPwError(null);
  }, [employeeId, isSelf]);

  // Detect whether the signed-in user has a password or signs in via Google only.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const providers: string[] = (data.user?.app_metadata?.providers as string[]) ?? [];
      setAuthMethod(providers.includes("email") ? "password" : "oauth");
    });
  }, []);

  // Complete a Google re-authentication round-trip: after the OAuth redirect
  // back to this page, a fresh SIGNED_IN session unlocks the data.
  useEffect(() => {
    const pending = sessionStorage.getItem("payslip_google_reauth");
    if (!pending || pending !== employeeId) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        sessionStorage.removeItem("payslip_google_reauth");
        setUnlocked(true);
        supabase.functions.invoke("notify-payslip-access", {
          body: { employee_id: employeeId, context: auditContext ?? "צפייה עצמית בתלושי שכר (אימות Google)" },
        }).catch(() => { /* audit failure must not block the employee's own view */ });
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  const handleGoogleVerify = async () => {
    setVerifying(true);
    setPwError(null);
    sessionStorage.setItem("payslip_google_reauth", employeeId);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.href,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      sessionStorage.removeItem("payslip_google_reauth");
      setVerifying(false);
      setPwError("שגיאה בהתחברות ל-Google, נסה שוב");
    }
    // On success the browser redirects to Google — no further action here.
  };


  // Fetch fresh employee record with balance fields (employees_public view doesn't expose balances)
  const { data: empFull } = useQuery({
    queryKey: ["employee-balances", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("vacation_balance, sick_balance, balances_source, balances_updated_at, id_number, full_name")
        .eq("id", employeeId)
        .maybeSingle();
      return data;
    },
  });
  const emp: any = { ...(employee ?? {}), ...(empFull ?? {}) };

  const openPayslip = async (p: any) => {
    // source_pdf_url is the whole submitted batch — every employee's payslip in
    // one file. #page=N is only a viewer hint, so falling back to it for an
    // employee handed them the entire company's payroll. Staff reviewing a batch
    // may still open it; an employee gets their own split file or nothing.
    // Storage RLS enforces the same rule server-side.
    const path = p.pdf_url ?? (isSelf ? null : p.source_pdf_url);
    if (!path) {
      toast({
        title: "התלוש אינו זמין לצפייה",
        description: "הקובץ האישי טרם הופק. יש לפנות לחשבות השכר להפקה מחדש.",
        variant: "destructive",
      });
      return;
    }
    const usingSplit = path === p.pdf_url;
    const url = await getPayslipSignedUrl(path, p.page_indices, !usingSplit);
    if (!url) {
      toast({ title: "שגיאה בהורדת התלוש", variant: "destructive" });
      return;
    }
    window.open(url, "_blank");
  };

  const handleVerifyPassword = async () => {
    if (!password) return;
    setVerifying(true);
    setPwError(null);
    const { data: sessionData } = await supabase.auth.getUser();
    const email = sessionData.user?.email;
    if (!email) {
      setVerifying(false);
      setPwError("לא נמצא משתמש מחובר");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setVerifying(false);
    if (error) {
      setPwError("הסיסמה שגויה, נסה שוב");
      return;
    }
    setPassword("");
    setUnlocked(true);
    try {
      await supabase.functions.invoke("notify-payslip-access", {
        body: { employee_id: employeeId, context: auditContext ?? "צפייה עצמית בתלושי שכר" },
      });
    } catch {
      /* audit failure must not block the employee's own view */
    }
  };

  const lastUpdate = emp?.balances_updated_at
    ? new Date(emp.balances_updated_at).toLocaleDateString("en-GB")
    : null;

  if (!isSelf) {
    return (
      <div className="animate-fade-in bg-card rounded-xl border border-border/50 shadow-card p-8 text-center max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6 text-destructive" />
        </div>
        <h2 className="text-base font-semibold">נתוני שכר חסויים</h2>
        <p className="text-sm text-muted-foreground mt-2">
          תלושי ונתוני השכר של {emp?.full_name ?? "העובד"} מוצגים לעובד עצמו בלבד, לאחר אימות סיסמה באזור האישי שלו.
        </p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="animate-fade-in bg-card rounded-xl border border-border/50 shadow-card p-8 max-w-md mx-auto text-center">
        <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-6 h-6 text-warning" />
        </div>
        <h2 className="text-base font-semibold">אימות זהות נדרש</h2>
        <p className="text-sm text-muted-foreground mt-2">
          נתוני השכר חסויים. להצגתם יש לאמת זהות מחדש באמצעות סיסמת המשתמש או חשבון ה-Google שלך.
        </p>
        {authMethod !== "oauth" && (
          <>
            <div className="mt-5 space-y-2 text-right">
              <Label htmlFor="payslip-password" className="text-xs text-muted-foreground">סיסמה</Label>
              <Input
                id="payslip-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleVerifyPassword(); }}
                dir="ltr"
                className="text-left"
              />
            </div>
            <Button className="mt-4 w-full gap-2" onClick={handleVerifyPassword} disabled={verifying || !password || authMethod === null}>
              <Eye className="w-4 h-4" />
              {verifying ? "מאמת..." : "הצג נתוני שכר"}
            </Button>
            <div className="flex items-center gap-3 mt-4">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">או</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {pwError && <p className="mt-4 text-xs text-destructive">{pwError}</p>}
        <Button variant="outline" className="mt-4 w-full gap-2" onClick={handleGoogleVerify} disabled={verifying}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {verifying ? "מעביר ל-Google..." : "אמת זהות עם Google"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
        <span className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
          נתוני שכר חסויים — נחשפו לאחר אימות זהות.
        </span>
        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => setUnlocked(false)}>
          <Lock className="w-3.5 h-3.5" />
          הסתר
        </Button>
      </div>

      {/* Summary cards */}
      {!hideBalances && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="w-4 h-4" />
              יתרת חופשה
            </div>
            <p className="text-3xl font-bold mt-2 text-primary">
              {Number(emp?.vacation_balance ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">ימים</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Stethoscope className="w-4 h-4" />
              יתרת מחלה
            </div>
            <p className="text-3xl font-bold mt-2 text-info">
              {Number(emp?.sick_balance ?? 0).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">ימים</p>
          </div>
          <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Calendar className="w-4 h-4" />
              עודכן לאחרונה
            </div>
            <p className="text-lg font-bold mt-2">{lastUpdate ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-1">
              מקור: {emp?.balances_source === "payslip" ? "תלוש שכר" : "ידני"}
            </p>
          </div>
        </div>
      )}

      {/* Payslips table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            היסטוריית תלושים
          </h2>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">טוען...</div>
        ) : (payslips?.length ?? 0) === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            עדיין לא הועלו תלושים לעובד זה.
            {!emp?.id_number && (
              <p className="text-xs mt-2">טיפ: ודא שתעודת הזהות מוגדרת בכרטיס העובד כדי שהמערכת תזהה אוטומטית.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th>חודש</th>
                  <th>שנה</th>
                  {canSeeSalary && <th>ברוטו</th>}
                  {canSeeSalary && <th>נטו</th>}
                  <th>יתרת חופשה</th>
                  <th>יתרת מחלה</th>
                  <th>ימי עבודה</th>
                  <th className="w-28">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {payslips!.map((p) => (
                  <tr key={p.id}>
                    <td>{MONTHS[p.period_month - 1]}</td>
                    <td>{p.period_year}</td>
                    {canSeeSalary && <td className="font-mono">{p.gross_salary?.toLocaleString("he-IL") ?? "—"}</td>}
                    {canSeeSalary && <td className="font-mono">{p.net_salary?.toLocaleString("he-IL") ?? "—"}</td>}
                    <td className="font-mono">{p.vacation_balance ?? "—"}</td>
                    <td className="font-mono">{p.sick_balance ?? "—"}</td>
                    <td className="font-mono">{p.work_days ?? "—"}</td>
                    <td>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="סיכום" onClick={() => setSummaryPayslip(p)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="הורדה" onClick={() => openPayslip(p)}>
                          <Download className="w-4 h-4" />
                        </Button>
                        {canSeeSalary && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="מחיקה"
                            onClick={() => setDeleteTarget(p)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PayslipSummaryDialog
        open={!!summaryPayslip}
        onClose={() => setSummaryPayslip(null)}
        payslip={summaryPayslip}
        employeeName={emp?.full_name}
        canSeeSalary={canSeeSalary}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את התלוש?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `תלוש ${MONTHS[deleteTarget.period_month - 1]} ${deleteTarget.period_year} יימחק לצמיתות מהמערכת ומאחסון הקבצים. פעולה זו לא ניתנת לביטול.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(deleteTarget.id);
                  toast({ title: "התלוש נמחק" });
                  setDeleteTarget(null);
                } catch (e: any) {
                  toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
                }
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
