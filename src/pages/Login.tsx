import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";

const UNAUTHORIZED_MESSAGE =
  "אין הרשאת גישה — האימייל שלך אינו רשום כמשתמש פעיל במערכת. פנה למנהל המערכת.";

type Mode = "choose" | "password" | "forgot";

export default function Login() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const verifyActiveEmployee = async (userId: string, userEmail: string | null | undefined) => {
    const { data: emp } = await supabase
      .from("employees")
      .select("id, linked_user_id")
      .ilike("email", userEmail ?? "")
      .eq("status", "active")
      .maybeSingle();
    return emp && emp.linked_user_id === userId;
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.redirected) return;

      const { error } = result;
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ok = await verifyActiveEmployee(user.id, user.email);
        if (!ok) {
          await supabase.auth.signOut();
          toast({
            title: "אין הרשאת גישה",
            description: UNAUTHORIZED_MESSAGE,
            variant: "destructive",
          });
          return;
        }
      }

      navigate("/select-company");
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
      toast({ title: "שגיאה", description: "יש להזין אימייל וסיסמה", variant: "destructive" });
      return;
    }
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
          toast({
            title: "אין הרשאת גישה",
            description: UNAUTHORIZED_MESSAGE,
            variant: "destructive",
          });
          return;
        }
      }
      navigate("/select-company");
    } catch (error: any) {
      toast({
        title: "שגיאה בהתחברות",
        description: translateAuthError(error),
        variant: "destructive",
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      toast({ title: "שגיאה", description: "יש להזין כתובת אימייל", variant: "destructive" });
      return;
    }
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
      setMode("password");
    } catch (error: any) {
      toast({
        title: "שגיאה בשליחת איפוס",
        description: translateAuthError(error),
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoImg} alt="לוגו תפעול 360" className="w-16 h-16 rounded-2xl mx-auto mb-0 object-contain" />
          <h1 className="text-2xl font-bold">תפעול 360 — מערכת ניהול משאבים מרכזית</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול עובדים, שכר, נוכחות וציוד</p>
        </div>

        <section aria-labelledby="login-heading" className="bg-card rounded-2xl border border-border shadow-card p-8">
          <h2 id="login-heading" className="text-lg font-semibold mb-2 text-center">כניסה למערכת</h2>
          <p className="text-xs text-muted-foreground text-center mb-6">
            הכניסה מיועדת למשתמשים שהוקמו מראש על ידי מנהל המערכת בלבד.
          </p>

          {mode === "choose" && (
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full gap-3 py-5"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                aria-busy={googleLoading}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {googleLoading ? "מתחבר..." : "התחבר באמצעות חשבון Google"}
              </Button>

              <div className="flex items-center gap-3 my-2">
                <div className="h-px bg-border flex-1" />
                <span className="text-xs text-muted-foreground">או</span>
                <div className="h-px bg-border flex-1" />
              </div>

              <Button
                type="button"
                variant="secondary"
                className="w-full gap-3 py-5"
                onClick={() => setMode("password")}
              >
                <Mail className="w-5 h-5" aria-hidden="true" />
                התחבר עם שם משתמש וסיסמה
              </Button>
            </div>
          )}

          {mode === "password" && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="text-sm font-medium mb-1.5 block">אימייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="login-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pr-10 pl-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="login-password" className="text-sm font-medium mb-1.5 block">סיסמה</label>
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
                    className="w-full pr-10 pl-10 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    required
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={emailLoading} aria-busy={emailLoading}>
                {emailLoading ? "מתחבר..." : "התחבר"}
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  שכחתי סיסמה / הגדרת סיסמה ראשונית
                </button>
                <button
                  type="button"
                  onClick={() => setMode("choose")}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  חזרה
                </button>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                הזן את כתובת האימייל שלך ונשלח אליך קישור להגדרת סיסמה חדשה. שימושי גם כניסה ראשונה לבחירת סיסמה.
              </p>
              <div>
                <label htmlFor="forgot-email" className="text-sm font-medium mb-1.5 block">אימייל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <input
                    id="forgot-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pr-10 pl-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={resetLoading} aria-busy={resetLoading}>
                {resetLoading ? "שולח..." : "שלח קישור לאיפוס סיסמה"}
              </Button>
              <div className="text-xs text-center">
                <button
                  type="button"
                  onClick={() => setMode("password")}
                  className="text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  חזרה לכניסה
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
