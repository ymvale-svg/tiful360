import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature, Upload, LogIn, FileDown } from "lucide-react";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { buildPdfForFormSnapshot as buildPdfForRecord } from "@/lib/pdf/formPdf";
import { ProtocolPreview } from "@/components/handover/ProtocolPreview";
import { uploadViaSignedToken } from "@/lib/signedFormUpload";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Gate = "checking" | "anonymous" | "forbidden" | "allowed";

export default function SignHandover() {
  const { token: tokenParam, code } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [record, setRecord] = useState<any>(null);
  const [gate, setGate] = useState<Gate>("checking");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const sigRef = useRef<SignaturePadHandle>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Short links (/h/:code) resolve to the full sign token before anything else.
  const [token, setToken] = useState<string | null>(tokenParam ?? null);
  const signPath = code ? `/h/${code}` : `/handover/${tokenParam}`;

  useEffect(() => {
    if (tokenParam) {
      setToken(tokenParam);
      return;
    }
    if (!code) return;
    (async () => {
      const { data } = await supabase.rpc("resolve_handover_short_code" as any, { _code: code });
      setToken((data as string) ?? "");
    })();
  }, [tokenParam, code]);

  // Signing always requires a portal session: the link alone is never enough.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setGate("anonymous");
      setLoading(false);
      return;
    }
    if (token === null) return;
    if (!token) {
      setRecord(null);
      setGate("allowed");
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase.rpc("get_handover_form_by_token", { _token: token! });
      const row = Array.isArray(data) ? data[0] ?? null : data ?? null;
      setRecord(row);
      if (!row) {
        setGate("allowed"); // invalid link message below
      } else {
        // RLS lets a user see only their own employee card (staff see more).
        const { data: emp } = await supabase
          .from("employees")
          .select("id")
          .eq("id", row.employee_id)
          .maybeSingle();
        setGate(emp ? "allowed" : "forbidden");
      }
      setLoading(false);
    })();
  }, [token, user, authLoading]);

  // Live PDF preview with logo (desktop).
  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await buildPdfForRecord(record.form_snapshot, sigUrl);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      } catch (e) {
        console.error("preview pdf failed", e);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [record, sigUrl]);

  const goToLogin = () => {
    sessionStorage.setItem("oauth_return_path", signPath);
    navigate(`/login?redirect=${encodeURIComponent(signPath)}`);
  };

  const handleSign = async () => {
    if (!record) return;
    const sig = sigRef.current?.getDataUrl();
    if (!sig) {
      toast({ title: "נא לחתום בקנבס", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setSigUrl(sig);

      let attachedUrl = record.attached_document_url;
      if (attachment) {
        attachedUrl = await uploadViaSignedToken({
          sign_token: token!,
          form_type: "handover",
          kind: "attachment",
          file: attachment,
        });
      }

      const pdfBlob = await buildPdfForRecord(record.form_snapshot, sig);
      const pdfUrl = await uploadViaSignedToken({
        sign_token: token!,
        form_type: "handover",
        kind: "pdf",
        file: pdfBlob,
        filename: "form.pdf",
        contentType: "application/pdf",
      });

      const { error } = await supabase.rpc("sign_handover_form_by_token", {
        _token: token!,
        _signature: sig,
        _attached_url: attachedUrl,
        _pdf_url: pdfUrl,
        _form_snapshot: { ...record.form_snapshot, receiver_signature: sig, employee_signature: sig },
      });
      if (error) throw error;

      // Let the person who sent the form know it was signed (in-app + email).
      void supabase.functions
        .invoke("notify-form-signed", { body: { token } })
        .catch(() => undefined);

      setDone(true);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">טוען...</div>
    );
  }

  if (gate === "anonymous") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
        <FileSignature className="w-14 h-14 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-bold">נדרשת כניסה לאזור האישי</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          לצורך חתימה על הטופס יש להתחבר לאזור האישי בפורטל. לאחר הכניסה תועברו אוטומטית לטופס.
        </p>
        <Button className="w-full max-w-xs" onClick={goToLogin}>
          <LogIn className="w-4 h-4 ml-2" aria-hidden="true" /> כניסה לאזור האישי
        </Button>
      </main>
    );
  }

  if (gate === "forbidden") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center" dir="rtl">
        <h1 className="text-xl font-bold text-destructive">הטופס אינו שייך לחשבון זה</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          התחברתם עם חשבון אחר. יש להתנתק ולהתחבר עם החשבון של העובד שעבורו נשלח הטופס.
        </p>
        <Button variant="outline" onClick={() => navigate("/portal")}>לאזור האישי</Button>
      </main>
    );
  }

  if (!record) {
    return <div className="min-h-screen flex items-center justify-center text-destructive" role="alert">קישור לא תקף</div>;
  }

  if (done || record.status === "signed") {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold mb-2">הטופס נחתם בהצלחה</h1>
        <p className="text-muted-foreground">תודה. עותק נשמר בתיק שלך.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/portal")}>לאזור האישי</Button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 p-3 sm:p-6 pb-28 sm:pb-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-3 sm:space-y-4">
        <div className="bg-card border rounded-xl p-4 sm:p-6">
          <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2 mb-1">
            <FileSignature className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" aria-hidden="true" />
            חתימה על טופס קבלת ציוד
          </h1>
          <p className="text-sm text-muted-foreground">אנא קראו את הטופס וחתמו בתחתית העמוד.</p>
        </div>

        {/* Mobile: readable HTML protocol. Desktop: the full PDF preview. */}
        <div className="bg-card border rounded-xl p-4 sm:hidden">
          <ProtocolPreview snapshot={record.form_snapshot} />
          {previewUrl && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
            >
              <FileDown className="w-4 h-4 ml-2" aria-hidden="true" /> פתיחת הטופס המלא (PDF)
            </Button>
          )}
        </div>

        <div className="hidden sm:block bg-white rounded-xl shadow-card overflow-hidden">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="תצוגת טופס קבלת הציוד"
              className="w-full"
              style={{ height: "85vh", border: 0 }}
            />
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground" role="status" aria-live="polite">טוען תצוגת טופס...</div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-4 sm:p-6 space-y-4">
          <SignaturePad ref={sigRef} label="חתימתי על קבלת הציוד" height={180} />

          <div>
            <label htmlFor="handover-attachment" className="flex items-center gap-2 px-3 py-3 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{attachment ? attachment.name : "צרף מסמך נוסף (אופציונלי)..."}</span>
              <input
                id="handover-attachment"
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button className="w-full h-12 text-base hidden sm:flex" disabled={busy} onClick={handleSign} aria-busy={busy}>
            {busy ? "שומר..." : "אישור וחתימה"}
          </Button>
        </div>
      </div>

      {/* Sticky action bar keeps the primary action reachable on phones. */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 p-3 bg-background/95 backdrop-blur border-t">
        <Button className="w-full h-12 text-base" disabled={busy} onClick={handleSign} aria-busy={busy}>
          {busy ? "שומר..." : "אישור וחתימה"}
        </Button>
      </div>
    </main>
  );
}
