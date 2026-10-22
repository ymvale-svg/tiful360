import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png";
type Details = Awaited<ReturnType<typeof supabase.auth.oauth.getAuthorizationDetails>>["data"];
export default function OAuthConsent() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, accessBlocked, signOut } = useAuth();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<Details>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (loading) return;
    let active = true;
    setError(""); setDetails(null);
    if (!authorizationId) { setError("קישור החיבור חסר או אינו תקין"); return; }
    if (!user) {
      navigate("/login?next=" + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash), { replace: true });
      return;
    }
    (async () => {
      try {
        const { data: blocked, error: accessError } = await supabase.rpc("my_access_blocked");
        if (accessError || blocked !== false || accessBlocked) throw new Error("אין הרשאת גישה למערכת");
        const { data, error: providerError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (providerError || !data) throw new Error("בקשת החיבור אינה תקינה או שפג תוקפה");
        if ("redirect_url" in data) { window.location.assign(data.redirect_url); return; }
        setDetails(data);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "לא ניתן לטעון את בקשת החיבור"); }
    })();
    return () => { active = false; };
  }, [authorizationId, user?.id, loading, accessBlocked, retry, navigate]);
  async function decide(approve: boolean) {
    if (busy || !details || accessBlocked) return;
    setBusy(true); setError("");
    try {
      const { data, error: actionError } = approve
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (actionError || !data?.redirect_url) throw new Error(approve ? "אישור החיבור נכשל; אפשר לנסות שוב" : "ביטול החיבור נכשל; אפשר לנסות שוב");
      window.location.assign(data.redirect_url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "הפעולה נכשלה"); setBusy(false); }
  }
  const authorization = details && "client" in details ? details : null;
  const scopeLabels: Record<string, string> = { openid: "זיהוי החשבון", email: "כתובת אימייל", profile: "פרופיל בסיסי" };
  return <main dir="rtl" className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
    <section className="w-full max-w-lg space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
      <img src={logo} alt="תפעול 360" className="mx-auto h-16 w-16 object-contain" />
      <h1 className="text-xl font-bold text-center">{authorization ? `חיבור ${authorization.client.name} לתפעול 360` : "חיבור לתפעול 360"}</h1>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!authorization && !error && <p role="status">טוען בקשת חיבור…</p>}
      {authorization && <>
        <p className="text-sm">החשבון המחובר: <bdi>{user?.email}</bdi></p>
        <p className="text-sm break-all">כתובת היישום: <bdi>{authorization.redirect_uri}</bdi></p>
        <p>היישום יוכל לקרוא חברות וקריאות שירות בהתאם להרשאות שלך בלבד.</p>
        <ul className="list-disc pr-5 text-sm space-y-1">{authorization.scope.split(" ").filter(Boolean).map((scope) => <li key={scope}>{scopeLabels[scope] ?? `הרשאה נוספת מבוקשת: ${scope}`}</li>)}</ul>
        <p className="text-sm text-muted-foreground">אין גישה לשכר, שליחת הודעות או שינוי נתונים. הרשאות המערכת ממשיכות לחול.</p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy || accessBlocked} onClick={() => decide(true)}>אשר חיבור</Button>
          <Button variant="outline" disabled={busy} onClick={() => decide(false)}>בטל חיבור</Button>
          <Button variant="ghost" disabled={busy} onClick={async () => { await signOut(); setDetails(null); }}>החלף חשבון</Button>
        </div>
      </>}
      {!authorization && error && authorizationId && <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>נסה שוב</Button>}
    </section>
  </main>;
}