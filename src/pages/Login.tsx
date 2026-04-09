import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Building2, Mail, Lock, Eye, EyeOff, Phone, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type AuthMode = "email" | "phone";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mode, setMode] = useState<AuthMode>("email");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate("/");
    } catch (error: any) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone || phone.length < 10) {
      toast({ title: "שגיאה", description: "נא להזין מספר טלפון תקין", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+972${phone.replace(/^0/, "")}`;
      const { error } = await supabase.auth.signInWithOtp({ phone: formattedPhone });
      if (error) throw error;
      setPhone(formattedPhone);
      setOtpSent(true);
      toast({ title: "קוד נשלח", description: "קוד אימות נשלח לטלפון שלך" });
    } catch (error: any) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: "sms",
      });
      if (error) throw error;
      navigate("/");
    } catch (error: any) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate("/");
    } catch (error: any) {
      toast({ title: "שגיאה בהתחברות עם Google", description: error.message, variant: "destructive" });
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">תפעול 360</h1>
          <p className="text-sm text-muted-foreground mt-1">מערכת ניהול משאבים מרכזית</p>
        </div>

        {/* Form */}
        <div className="bg-card rounded-2xl border border-border shadow-card p-8">
          <h2 className="text-lg font-semibold mb-6 text-center">כניסה למערכת</h2>

          {/* Google SSO */}
          <Button
            type="button"
            variant="outline"
            className="w-full gap-3 mb-4 py-5"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {googleLoading ? "מתחבר..." : "התחבר באמצעות חשבון חברה"}
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground">או</span>
            </div>
          </div>

          {/* Auth mode tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1 mb-5">
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1 mb-5">
              <button
                onClick={() => { setMode("email"); setOtpSent(false); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  mode === "email" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                דוא"ל וסיסמה
              </button>
              <button
                onClick={() => { setMode("phone"); setOtpSent(false); }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                  mode === "phone" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                SMS OTP
              </button>
            </div>

          {/* Email/Password form */}
          {(mode === "email" || mode === "signup") && (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">דוא"ל</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.co.il"
                    className="w-full pr-10 pl-4 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    required
                    dir="ltr"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">סיסמה</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={showPassword ? "text" : "password"}
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
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "טוען..." : mode === "signup" ? "הרשמה" : "כניסה"}
              </Button>
            </form>
          )}

          {/* Phone OTP form */}
          {mode === "phone" && !otpSent && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">מספר טלפון</label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="w-full pr-10 pl-4 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    dir="ltr"
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">הזן מספר ישראלי או בינלאומי עם קידומת +</p>
              </div>
              <Button className="w-full gap-2" onClick={handleSendOtp} disabled={loading}>
                {loading ? "שולח..." : "שלח קוד אימות"}
                <ArrowRight className="w-4 h-4 rotate-180" />
              </Button>
            </div>
          )}

          {mode === "phone" && otpSent && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">
                  קוד אימות נשלח ל-<span className="font-mono font-medium text-foreground" dir="ltr">{phone}</span>
                </p>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">קוד אימות</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-full px-4 py-3 bg-muted rounded-lg text-center text-2xl font-mono tracking-[0.5em] outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  dir="ltr"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? "מאמת..." : "אמת והתחבר"}
              </Button>
              <button
                type="button"
                onClick={() => { setOtpSent(false); setOtp(""); }}
                className="w-full text-sm text-primary hover:underline"
              >
                שלח קוד מחדש
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            {mode === "signup" ? (
              <button onClick={() => setMode("email")} className="text-sm text-primary hover:underline">
                יש לך כבר חשבון? התחבר
              </button>
            ) : (
              <button onClick={() => setMode("signup")} className="text-sm text-primary hover:underline">
                אין לך חשבון? הירשם
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
