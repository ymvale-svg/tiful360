import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Building2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";

export default function Welcome() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase puts the invite tokens in the URL hash; the SDK consumes them automatically.
    const init = async () => {
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

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // Sign out the invite session first so Google sign-in establishes a
      // fresh, fully-validated session tied to the user's Google identity.
      await supabase.auth.signOut();
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
            {userEmail ? `${userEmail} — ` : ""}הכניסה למערכת מתבצעת באמצעות חשבון Google בלבד
          </p>
        </div>

        <section aria-labelledby="welcome-google-heading" className="bg-card rounded-2xl border border-border shadow-card p-8">
          <h2 id="welcome-google-heading" className="sr-only">כניסה באמצעות Google</h2>
          <p className="text-xs text-muted-foreground text-center mb-6">
            לפי מדיניות המערכת, הכניסה מתבצעת אך ורק באמצעות חשבון Google המשויך לכתובת האימייל שאליה נשלחה ההזמנה.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-3 py-5"
            onClick={handleGoogle}
            disabled={googleLoading}
            aria-busy={googleLoading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "מעביר ל-Google..." : "המשך עם Google"}
          </Button>
        </section>
      </div>
    </main>
  );
}
