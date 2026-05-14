import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo.png";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { translateAuthError } from "@/lib/authErrors";

const UNAUTHORIZED_MESSAGE =
  "אין הרשאת גישה — האימייל שלך אינו רשום כמשתמש פעיל במערכת. פנה למנהל המערכת.";

export default function Login() {
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });

      if (result.redirected) return;

      const { error } = result;
      if (error) throw error;

      // Verify the signed-in user is linked to an active employee that was
      // pre-provisioned by an admin (linked_user_id matches the auth user id).
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: emp } = await supabase
          .from("employees")
          .select("id, linked_user_id")
          .ilike("email", user.email ?? "")
          .eq("status", "active")
          .maybeSingle();

        if (!emp || emp.linked_user_id !== user.id) {
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
            הכניסה מתבצעת דרך חשבון Google בלבד, ועבור משתמשים שהוקמו מראש על ידי מנהל המערכת.
          </p>

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
        </section>
      </div>
    </main>
  );
}
