import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import logoImg from "@/assets/logo.svg";
import { LineFieldBackground } from "@/components/backgrounds/LineFieldBackground";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";
import { oauthReturnPath } from "@/lib/oauth-return-path";

const UNAUTHORIZED_MESSAGE =
  "אין הרשאת גישה — האימייל שלך אינו רשום כמשתמש פעיל במערכת. פנה למנהל המערכת.";

type Mode = "signin" | "forgot";

export default function Login() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [searchParams] = useSearchParams();
  // ?mode=forgot opens straight on "שכחתי סיסמה" (used by an expired reset link).
  const [mode, setModeState] = useState<Mode>(() => (searchParams.get("mode") === "forgot" ? "forgot" : "signin"));
  /** Inline error for the form on screen (password / forgot), shown next to it instead of a fleeting toast. */
  const [formError, setFormError] = useState<string | null>(null);
  const setMode = (m: Mode) => { setFormError(null); setModeState(m); };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  /** Inline sign-in error (kept visible, unlike a toast — e.g. after a Google redirect). */
  const [authError, setAuthError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  /** Same-origin path to open after a successful sign-in (e.g. a signing link). */
  const redirectParam = searchParams.get("next") ?? searchParams.get("redirect");
  const afterLogin = redirectParam === null ? "/select-company" : oauthReturnPath(redirectParam);

  const verifyActiveEmployee = async (_userId: string, _userEmail: string | null | undefined) => {
    // Links the signed-in account to its active employee card (by email) and
    // returns whether the account is authorized to use the system.
    // A transient RPC/network failure must not sign the user out — retry twice
    // before treating the account as unauthorized.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.rpc("claim_employee_for_current_user");
      if (!error) return data === true;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
    return false;
  };

  // If a session already exists (e.g. returning from Google via redirect),
  // continue into the system instead of leaving the user on the login screen.
  useEffect(() => {
    let done = false;
    const proceed = async (hasSession: boolean) => {
      if (done || !hasSession) return;
      done = true;
      const ok = await verifyActiveEmployee("", null);
      if (ok) {
        navigate(afterLogin, { replace: true });
        return;
      }
      // Same as the popup path: an unauthorized account must not stay signed in.
      await supabase.auth.signOut();
      setAuthError(UNAUTHORIZED_MESSAGE);
      done = false;
    };
    supabase.auth.getSession().then(({ data }) => proceed(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_IN") setTimeout(() => proceed(!!s), 0);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const handleGoogleLogin = async () => {
    setAuthError(null);
    setGoogleLoading(true);
    // Managed Google sign-in returns to /login?next=..., which carries the return
    // path — no sessionStorage key here (a stale key would bounce the dashboard later).
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: new URL(`/login?next=${encodeURIComponent(afterLogin)}`, window.location.origin).href,
      });

      if (result.redirected) return;

      const { error } = result;
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ok = await verifyActiveEmployee(user.id, user.email);
        if (!ok) {
          await supabase.auth.signOut();
          setAuthError(UNAUTHORIZED_MESSAGE);
          toast({
            title: "אין הרשאת גישה",
            description: UNAUTHORIZED_MESSAGE,
            variant: "destructive",
          });
          return;
        }
      }

      navigate(afterLogin);
    } catch (error: any) {
      const raw = (error?.message || "").toString();
      const isUnauthorized =
        raw.includes("מורשה") || raw.includes("not allowed") || raw.includes("Signups not allowed");
      toast({
        title: isUnauthorized ? "אין הרשאת גישה" : "שגיאה בהתחברות עם Google",
        description: isUnauthorized ? UNAUTHORIZED_MESSAGE : translateAuthError(error),
        variant: "destructive",
      });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError(!trimmedEmail ? "יש להזין כתובת אימייל" : "יש להזין סיסמה");
      document.getElementById(!trimmedEmail ? "login-email" : "login-password")?.focus();
      return;
    }
    setAuthError(null);
    setFormError(null);
    setEmailLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;

      if (data.user) {
        const ok = await verifyActiveEmployee(data.user.id, data.user.email);
        if (!ok) {
          await supabase.auth.signOut();
          setAuthError(UNAUTHORIZED_MESSAGE);
          return;
        }
      }
      navigate(afterLogin);
    } catch (error: any) {
      setFormError(translateAuthError(error));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFormError("יש להזין כתובת אימייל");
      document.getElementById("forgot-email")?.focus();
      return;
    }
    setFormError(null);
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({
        title: "נשלח קישור לאיפוס סיסמה",
        description:
          "אם הכתובת רשומה במערכת, יישלח אליה מייל עם קישור להגדרת סיסמה חדשה. בדוק גם את תיקיית הספאם.",
      });
      setMode("signin");
    } catch (error: any) {
      setFormError(translateAuthError(error));
    } finally {
      setResetLoading(false);
    }
  };

  const inputCls = "w-full min-h-11 pr-10 pl-3 py-2.5 bg-background border border-input rounded-lg text-sm outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-destructive";

  // Split layout after "Sign In Split Screen" (felipemenezes098) on 21st.dev: a brand panel beside
  // the form on wide screens, a compact brand header on phones. Google and the email form share
  // one screen, so signing in with a password is one step instead of two.
  return (
    <main className="relative isolate min-h-screen bg-muted/40 flex items-center justify-center p-4 sm:p-6">
      <LineFieldBackground />
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl md:min-h-[480px] md:grid-cols-[1fr_1.1fr]">
        <aside className="relative hidden flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-primary to-primary/85 p-10 text-center text-primary-foreground md:flex" aria-label="תפעול 360">
          <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-primary-foreground/10 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-primary-foreground/10 blur-3xl" aria-hidden="true" />

          <div className="relative flex flex-col items-center gap-4">
            <img src={logoImg} alt="" className="h-20 w-20 rounded-2xl bg-primary-foreground/95 object-contain p-2 shadow-lg" />
            <p className="text-2xl font-bold">תפעול 360</p>
            <p className="text-[28px] font-bold leading-tight text-balance">זה כל מה שעובד צריך</p>
          </div>
        </aside>

        <section aria-labelledby="login-heading" className="flex flex-col justify-center gap-5 p-6 sm:p-10">
          {/* Phones: the brand panel is hidden, so the form carries a compact brand header. */}
          <div className="flex items-center gap-3 md:hidden">
            <img src={logoImg} alt="" className="h-11 w-11 rounded-xl object-contain" />
            <div>
              <p className="text-base font-bold">תפעול 360</p>
              <p className="text-xs text-muted-foreground">זה כל מה שעובד צריך</p>
            </div>
          </div>

          <div className="space-y-1 text-center">
            <h1 id="login-heading" className="text-xl font-bold">{mode === "forgot" ? "איפוס סיסמה" : "ברוכים הבאים"}</h1>
            {mode === "forgot" && (
              <p className="text-sm text-muted-foreground">נשלח אליכם קישור להגדרת סיסמה חדשה. מתאים גם לכניסה ראשונה.</p>
            )}
          </div>

          {authError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {authError}
            </p>
          )}

          {mode === "signin" && (
            <>
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-11 gap-3"
                onClick={handleGoogleLogin}
                loading={googleLoading}
                loadingText="מתחבר…"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                המשך עם Google
              </Button>

              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">או עם אימייל וסיסמה</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={handleEmailLogin} className="space-y-4" noValidate aria-describedby={formError ? "login-form-error" : undefined}>
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-sm font-medium block">אימייל</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.co.il"
                      className={inputCls}
                      required
                      aria-invalid={formError && !email.trim() ? true : undefined}
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="login-password" className="text-sm font-medium block">סיסמה</label>
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="min-h-8 rounded px-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      שכחתי סיסמה / סיסמה ראשונה
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className={inputCls.replace("pl-3", "pl-12")}
                      required
                      aria-invalid={formError ? true : undefined}
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                      aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>

                {formError && (
                  <p id="login-form-error" role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {formError}
                  </p>
                )}

                <Button type="submit" className="w-full min-h-11" loading={emailLoading} loadingText="מתחבר…">
                  כניסה
                </Button>
              </form>
            </>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4" noValidate aria-describedby={formError ? "forgot-form-error" : undefined}>
              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="text-sm font-medium block">אימייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.co.il"
                    className={inputCls}
                    required
                    aria-invalid={formError ? true : undefined}
                    dir="ltr"
                  />
                </div>
              </div>
              {formError && (
                <p id="forgot-form-error" role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {formError}
                </p>
              )}
              <Button type="submit" className="w-full min-h-11" loading={resetLoading} loadingText="שולח…">
                שלח קישור לאיפוס סיסמה
              </Button>
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="mx-auto flex min-h-11 items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                חזרה לכניסה
              </button>
            </form>
          )}

        </section>
      </div>
    </main>
  );
}
