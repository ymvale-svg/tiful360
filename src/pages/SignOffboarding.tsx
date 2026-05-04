import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature, Upload } from "lucide-react";
import {
  OffboardingFormView,
  OffboardingFormData,
} from "@/components/OffboardingFormView";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { buildOffboardingPdf } from "@/lib/pdf/buildOffboardingPdf";
import { uploadViaSignedToken } from "@/lib/signedFormUpload";
import { useToast } from "@/hooks/use-toast";

export default function SignOffboarding() {
  const { token } = useParams();
  const { toast } = useToast();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [done, setDone] = useState(false);

  const formRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<SignaturePadHandle>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data } = await supabase
        .from("offboarding_forms")
        .select("*")
        .eq("sign_token", token)
        .maybeSingle();
      setRecord(data);
      setLoading(false);
    })();
  }, [token]);

  const handleSign = async () => {
    if (!record || !formRef.current) return;
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

      const { error } = await supabase
        .from("offboarding_forms")
        .update({
          status: "signed",
          signature_data: sig,
          attached_document_url: attachedUrl,
          pdf_url: pdfUrl,
          signed_at: new Date().toISOString(),
          form_snapshot: {
            ...record.form_snapshot,
            receiver_signature: sig,
          },
        })
        .eq("sign_token", token);
      if (error) throw error;

      // Mark the assets returned (best-effort — RLS may block from anon, that's ok)
      const assetIds: string[] = (record.form_snapshot?.assets ?? [])
        .map((a: any) => a.asset_id)
        .filter(Boolean);
      if (assetIds.length) {
        await supabase
          .from("assets")
          .update({ status: "in_stock", current_owner_id: null })
          .in("id", assetIds);
      }

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
      <div className="min-h-screen flex items-center justify-center">
        טוען...
      </div>
    );
  if (!record)
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        קישור לא תקף
      </div>
    );

  if (done || record.status === "signed") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        dir="rtl"
      >
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">הטופס נחתם בהצלחה</h1>
        <p className="text-muted-foreground">תודה. עותק נשמר בתיק שלך.</p>
        {record.pdf_url && (
          <a
            href={record.pdf_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 text-primary underline"
          >
            הורד PDF
          </a>
        )}
      </div>
    );
  }

  const data: OffboardingFormData = {
    ...(record.form_snapshot as OffboardingFormData),
    receiver_signature: sigUrl,
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-card border rounded-xl p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
            <FileSignature className="w-6 h-6 text-primary" />
            חתימה על טופס החזרת ציוד
          </h1>
          <p className="text-sm text-muted-foreground">
            אנא קרא את פרטי הציוד וחתום למטה.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-card overflow-auto">
          <div
            className="origin-top-right mx-auto"
            style={{ transform: "scale(0.85)", transformOrigin: "top center" }}
          >
            <OffboardingFormView ref={formRef} data={data} />
          </div>
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          <SignaturePad
            ref={sigRef}
            label="חתימתי על החזרת הציוד"
            height={180}
          />

          <div>
            <label className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70">
              <Upload className="w-4 h-4" />
              <span className="truncate">
                {attachment
                  ? attachment.name
                  : "צרף מסמך נוסף (אופציונלי)..."}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) =>
                  setAttachment(e.target.files?.[0] ?? null)
                }
              />
            </label>
          </div>

          <Button className="w-full" disabled={busy} onClick={handleSign}>
            {busy ? "שומר..." : "אישור וחתימה"}
          </Button>
        </div>
      </div>
    </div>
  );
}
