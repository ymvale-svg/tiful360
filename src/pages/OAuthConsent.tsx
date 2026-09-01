import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

function oauthApi(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("חסר מזהה בקשת הרשאה");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/login?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error: detailsError } = await oauthApi().getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const api = oauthApi();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorizationId)
      : await api.denyAuthorization(authorizationId);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("שרת ההרשאות לא החזיר כתובת חזרה");
      return;
    }
    window.location.href = target;
  }

  return (
    <main dir="rtl" className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm text-card-foreground">
        {error ? (
          <>
            <h1 className="text-xl font-semibold mb-2">לא ניתן לטעון את בקשת ההרשאה</h1>
            <p className="text-muted-foreground text-sm">{error}</p>
          </>
        ) : !details ? (
          <p className="text-muted-foreground">טוען…</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold mb-2">
              חיבור {details.client?.name ?? "יישום חיצוני"} לחשבון שלך
            </h1>
            <p className="text-muted-foreground text-sm mb-6">
              הפעולה תאפשר ל{details.client?.name ?? "יישום"} לגשת לנתוני תפעול 360 בהרשאות שלך בלבד.
            </p>
            <div className="flex gap-3">
              <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
                אישור
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => decide(false)} className="flex-1">
                דחייה
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
