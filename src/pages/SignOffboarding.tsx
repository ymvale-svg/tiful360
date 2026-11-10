import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature, Upload, ExternalLink } from "lucide-react";
import type { OffboardingFormData } from "@/lib/pdf/types";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { buildOffboardingPdf } from "@/lib/pdf/lazy";
import { uploadViaSignedToken } from "@/lib/signedFormUpload";
import { useToast } from "@/hooks/use-toast";

const CONDITION_LABEL: Record<string, string> = { good: "תקין", damaged: "לא תקין", missing: "חסר" };

export default function SignOffboarding() {
  const { token } = useParams();
  const { toast } = useToast();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const sigRef = useRef<SignaturePadHandle>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Local copy of the PDF signed in this session. record.pdf_url is a private
  // storage path (not a URL), so it cannot be linked from this public page.
  const [signedCopyUrl, setSignedCopyUrl] = useState<string | null>(null);

  useEffect(() => () => { if (signedCopyUrl) URL.revokeObjectURL(signedCopyUrl); }, [signedCopyUrl]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data } = await supabase.rpc("get_offboarding_form_by_token", { _token: token });
      setRecord(Array.isArray(data) ? data[0] ?? null : data ?? null);
      setLoading(false);
    })();
  }, [token]);

  // Generate live PDF preview (with logo) whenever record loads or signature changes.
  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const data: OffboardingFormData = {
          ...(record.form_snapshot as OffboardingFormData),
          receiver_signature: sigUrl,
        };
        const blob = await buildOffboardingPdf(data);
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
      // Wait for the signature image to render before snapshotting to PDF
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(r)),
      );

      let attachedUrl = record.attached_document_url;
      if (attachment) {
        attachedUrl = await uploadViaSignedToken({
          sign_token: token!,
          form_type: "offboarding",
          kind: "attachment",
          file: attachment,
        });
      }

      const pdfBlob = await buildOffboardingPdf({
        ...(record.form_snapshot as OffboardingFormData),
        receiver_signature: sig,
      });
      const pdfUrl = await uploadViaSignedToken({
        sign_token: token!,
        form_type: "offboarding",
        kind: "pdf",
        file: pdfBlob,
        filename: "form.pdf",
        contentType: "application/pdf",
      });

      const { error } = await supabase.rpc("sign_offboarding_form_by_token", {
        _token: token!,
        _signature: sig,
        _attached_url: attachedUrl,
        _pdf_url: pdfUrl,
        _form_snapshot: { ...record.form_snapshot, receiver_signature: sig },
      });
      if (error) throw error;

      setSignedCopyUrl(URL.createObjectURL(pdfBlob));
      setDone(true);
    } catch (err: any) {
      toast({
        title: "שגיאה",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center" role="status" aria-live="polite">
        טוען...
      </div>
    );
  if (!record)
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive" role="alert">
        קישור לא תקף
      </div>
    );

  if (done || record.status === "signed") {
    return (
      <main
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        dir="rtl"
      >
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" aria-hidden="true" />
        <h1 className="text-2xl font-bold mb-2">הטופס נחתם בהצלחה</h1>
        <p className="text-muted-foreground">תודה. הטופס החתום נשלח לחברה.</p>
        {signedCopyUrl && (
          <a
            href={signedCopyUrl}
            download="טופס-עזיבה-חתום.pdf"
            className="mt-4 text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          >
            הורד עותק PDF
          </a>
        )}
      </main>
    );
  }

  const data: OffboardingFormData = {
    ...(record.form_snapshot as OffboardingFormData),
    receiver_signature: sigUrl,
  };

  return (
    <main className="min-h-screen bg-muted/30 p-4 sm:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-card border rounded-xl p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
            <FileSignature className="w-6 h-6 text-primary" aria-hidden="true" />
            חתימה על טופס החזרת ציוד
          </h1>
          <p className="text-sm text-muted-foreground">
            אנא קרא את פרטי הציוד וחתום למטה.
          </p>
        </div>

        {/* Readable summary on every screen: a PDF inside an iframe renders blank on most phones. */}
        <section aria-labelledby="offboarding-summary" className="bg-card border rounded-xl p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="offboarding-summary" className="text-base font-semibold">פרטי הטופס</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">עובד</dt><dd className="font-medium">{data.employee_name}</dd>
                {data.employee_department && (<><dt className="text-muted-foreground">מחלקה</dt><dd>{data.employee_department}</dd></>)}
                {data.company_name && (<><dt className="text-muted-foreground">חברה</dt><dd>{data.company_name}</dd></>)}
                {data.end_date && (<><dt className="text-muted-foreground">תאריך סיום</dt><dd>{new Date(data.end_date).toLocaleDateString("en-GB")}</dd></>)}
                <dt className="text-muted-foreground">טופס</dt><dd>#{data.form_index}</dd>
              </dl>
            </div>
            <Button asChild variant="outline" className="gap-2" disabled={!previewUrl}>
              <a
                href={previewUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!previewUrl || undefined}
                onClick={(e) => { if (!previewUrl) e.preventDefault(); }}
              >
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
                {previewUrl ? "פתח את הטופס כ-PDF" : "מכין PDF…"}
              </a>
            </Button>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">ציוד להחזרה ({data.assets?.length ?? 0})</h3>
            <ul className="divide-y divide-border rounded-lg border">
              {(data.assets ?? []).map((a) => (
                <li key={a.asset_id} className="p-3 text-sm">
                  <p className="font-medium">{a.asset_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[a.category_name, a.asset_code && `מזהה ${a.asset_code}`, a.serial_number && `סידורי ${a.serial_number}`]
                      .filter(Boolean).join(" · ")}
                  </p>
                  {(a.condition_at_return || a.notes) && (
                    <p className="text-xs mt-1">
                      {a.condition_at_return && <span>מצב: {CONDITION_LABEL[a.condition_at_return] ?? a.condition_at_return}</span>}
                      {a.condition_at_return && a.notes && " · "}
                      {a.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Full PDF preview only where it actually renders (wide screens). */}
        <div className="hidden lg:block bg-white rounded-xl shadow-card overflow-hidden">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="תצוגת טופס החזרת הציוד"
              className="w-full"
              style={{ height: "85vh", border: 0 }}
            />
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
              טוען תצוגת טופס...
            </div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          <SignaturePad
            ref={sigRef}
            label="חתימתי על החזרת הציוד"
            height={180}
          />

          <div>
            <label htmlFor="offboarding-attachment" className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <Upload className="w-4 h-4" aria-hidden="true" />
              <span className="truncate">
                {attachment
                  ? attachment.name
                  : "צרף מסמך נוסף (אופציונלי)..."}
              </span>
              <input
                id="offboarding-attachment"
                type="file"
                accept="application/pdf,image/*"
                className="sr-only"
                onChange={(e) =>
                  setAttachment(e.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>

          <Button className="w-full" disabled={busy} onClick={handleSign} aria-busy={busy}>
            {busy ? "שומר..." : "אישור וחתימה"}
          </Button>
        </div>
      </div>
    </main>
  );
}
