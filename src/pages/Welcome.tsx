import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Building2, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";

export default function Welcome() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase puts the invite tokens in the URL hash; the SDK consumes them automatically.
    const init = async () => {
      // Give the SDK a moment to process the hash on first mount
      await new Promise((r) => setTimeout(r, 50));
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setHasSession(true);
        setUserEmail(data.session.user.email ?? null);
      }
      setChecking(false);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setHasSession(true);
        setUserEmail(session.user.email ?? null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "שגיאה", description: "הסיסמאות אינן תואמות", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "שגיאה", description: "הסיסמה חייבת להכיל לפחות 6 תווים", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: "ברוך הבא!", description: "הסיסמה הוגדרה בהצלחה" });
      navigate("/");
    } catch (error: any) {
      toast({ title: "שגיאה", description: translateAuthError(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/`,
      });
      if (result.error) {
        toast({ title: "שגיאה", description: translateAuthError(result.error), variant: "destructive" });
        setGoogleLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate("/");
    } catch (error: any) {
      toast({ title: "שגיאה", description: translateAuthError(error), variant: "destructive" });
      setGoogleLoading(false);
    }
  };

  const handleSkip = () => navigate("/");

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4" aria-hidden="true">
            <Building2 className="w-8 h-8 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold mb-2">קישור לא תקף</h1>
          <p className="text-muted-foreground mb-6">
            קישור ההזמנה אינו תקף או שפג תוקפו. בקש מהמנהל לשלוח הזמנה חדשה.
          </p>
          <Button onClick={() => navigate("/login")}>
            <ArrowLeft className="w-4 h-4 ml-2" aria-hidden="true" />
            למסך הכניסה
          </Button>
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
          <h1 className="text-2xl font-bold">ברוך הבא!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {userEmail ? `${userEmail} — ` : ""}בחר כיצד תרצה להיכנס למערכת
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-card p-8 space-y-6">
          {/* Set password */}
          <form onSubmit={handleSetPassword} className="space-y-4" aria-labelledby="welcome-pw-heading">
            <div>
              <h2 id="welcome-pw-heading" className="text-base font-semibold mb-1">הגדרת סיסמה</h2>
              <p className="text-xs text-muted-foreground">קבע סיסמה כדי להתחבר באמצעות אימייל</p>
            </div>
            <div>
              <label htmlFor="welcome-password" className="text-sm font-medium mb-1.5 block">סיסמה חדשה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="welcome-password"
                  name="password"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-10 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  dir="ltr"
                  aria-required="true"
                  minLength={6}
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
            <div>
              <label htmlFor="welcome-password-confirm" className="text-sm font-medium mb-1.5 block">אימות סיסמה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
                <input
                  id="welcome-password-confirm"
                  name="password-confirm"
                  autoComplete="new-password"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-4 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  dir="ltr"
                  aria-required="true"
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !password || !confirmPassword} aria-busy={loading}>
              {loading ? "שומר..." : "הגדר סיסמה והיכנס"}
            </Button>
          </form>

          <div className="relative" role="separator" aria-label="או">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">או</span>
            </div>
          </div>

          {/* Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={googleLoading}
            aria-busy={googleLoading}
          >
            {googleLoading ? "מעביר ל-Google..." : "המשך עם Google"}
          </Button>

          <button
            type="button"
            onClick={handleSkip}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            דלג והיכנס למערכת
          </button>
        </div>
      </div>
    </main>
  );
}
