import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  /** "checking" until the link is verified, so "הקישור אינו תקף" never shows while it is still being read. */
  const [linkState, setLinkState] = useState<"checking" | "valid" | "invalid">("checking");
  const [error, setError] = useState<{ field: "password" | "confirm" | "form"; message: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const hash = window.location.hash;
    // Invitation links land here in some flows — redirect to /welcome
    if (hash && hash.includes("type=invite")) {
      navigate("/welcome" + hash, { replace: true });
      return;
    }
    // Supabase reports an expired/used link in the hash or query (error_code=otp_expired …).
    const query = window.location.search;
    if (/error(_code|_description)?=/.test(hash) || /error(_code|_description)?=/.test(query)) {
      setLinkState("invalid");
      return;
    }
    let settled = false;
    const valid = () => { settled = true; setLinkState("valid"); };
    // A recovery token in the hash is the link itself — same rule as before.
    if (hash.includes("type=recovery")) valid();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") valid();
    });

    const hasRecoveryToken = hash.includes("type=recovery") || new URLSearchParams(query).has("code");
    // The token is exchanged asynchronously; give it a few seconds before calling the link invalid.
    const timer = window.setTimeout(async () => {
      if (settled) return;
      const { data } = await supabase.auth.getSession();
      if (settled) return;
      if (hasRecoveryToken && data.session) valid();
      else setLinkState("invalid");
    }, hasRecoveryToken ? 4000 : 1500);

    return () => { subscription.unsubscribe(); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError({ field: "password", message: "הסיסמה חייבת להכיל לפחות 6 תווים" });
      document.getElementById("reset-password")?.focus();
      return;
    }
    if (password !== confirmPassword) {
      setError({ field: "confirm", message: "הסיסמאות אינן תואמות" });
      document.getElementById("reset-password-confirm")?.focus();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "הסיסמה עודכנה בהצלחה", description: "כעת תוכל להתחבר עם האימייל והסיסמה החדשה" });
      navigate("/login");
    } catch (err: any) {
      setError({ field: "form", message: translateAuthError(err) });
    } finally {
      setLoading(false);
    }
  };

  if (linkState === "checking") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div role="status" className="w-full max-w-md text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-semibold">בודק את הקישור…</h1>
          <p className="text-sm text-muted-foreground">זה לוקח רק כמה שניות.</p>
        </div>
      </main>
    );
  }

  if (linkState === "invalid") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <Building2 className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold mb-2">איפוס סיסמה</h1>
          <p className="text-muted-foreground mb-6">
            הקישור אינו תקף או שפג תוקפו. שלחו לעצמכם קישור חדש — זה לוקח דקה.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button className="min-h-11" onClick={() => navigate("/login?mode=forgot")}>שלח קישור חדש</Button>
            <Button variant="outline" className="min-h-11" onClick={() => navigate("/login")}>חזרה למסך הכניסה</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <Building2 className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold">הגדרת סיסמה חדשה</h1>
          <p className="text-sm text-muted-foreground mt-1">הזן סיסמה חדשה לחשבון שלך</p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card p-8">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="reset-password" className="text-sm font-medium mb-1.5 block">סיסמה חדשה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="reset-password"
                  name="password"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-11 pr-10 pl-12 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  required
                  aria-required="true"
                  aria-invalid={error?.field === "password" ? true : undefined}
                  aria-describedby={["reset-password-hint", error?.field === "password" ? "reset-password-error" : ""].filter(Boolean).join(" ")}
                  minLength={6}
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
              <p id="reset-password-hint" className="mt-1.5 text-xs text-muted-foreground">לפחות 6 תווים.</p>
              {error?.field === "password" && <p id="reset-password-error" role="alert" className="mt-1 text-xs font-medium text-destructive">{error.message}</p>}
            </div>
            <div>
              <label htmlFor="reset-password-confirm" className="text-sm font-medium mb-1.5 block">אימות סיסמה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="reset-password-confirm"
                  name="password-confirm"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-11 pr-10 pl-4 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  required
                  aria-required="true"
                  aria-invalid={error?.field === "confirm" ? true : undefined}
                  aria-describedby={error?.field === "confirm" ? "reset-confirm-error" : undefined}
                  minLength={6}
                  dir="ltr"
                />
              </div>
              {error?.field === "confirm" && <p id="reset-confirm-error" role="alert" className="mt-1 text-xs font-medium text-destructive">{error.message}</p>}
            </div>
            {error?.field === "form" && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error.message}</p>
            )}
            <Button type="submit" className="w-full min-h-11" loading={loading} loadingText="מעדכן…">
              עדכן סיסמה
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}