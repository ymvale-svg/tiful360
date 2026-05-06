import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileSignature, Upload } from "lucide-react";
import type { HandoverFormData } from "@/lib/pdf/types";
import { SignaturePad, SignaturePadHandle } from "@/components/SignaturePad";
import { buildHandoverPdf } from "@/lib/pdf/buildHandoverPdf";
import { uploadViaSignedToken } from "@/lib/signedFormUpload";
import { useToast } from "@/hooks/use-toast";

export default function SignHandover() {
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

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data } = await supabase.rpc("get_handover_form_by_token", { _token: token });
      setRecord(Array.isArray(data) ? data[0] ?? null : data ?? null);
      setLoading(false);
    })();
  }, [token]);

  // Live PDF preview with logo
  useEffect(() => {
    if (!record) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const data: HandoverFormData = {
          ...(record.form_snapshot as HandoverFormData),
          receiver_signature: sigUrl,
        };
        const blob = await buildHandoverPdf(data);
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

      let attachedUrl = record.attached_document_url;
      if (attachment) {
        attachedUrl = await uploadViaSignedToken({
          sign_token: token!,
          form_type: "handover",
          kind: "attachment",
          file: attachment,
        });
      }

      const pdfBlob = await buildHandoverPdf({ ...(record.form_snapshot as HandoverFormData), receiver_signature: sig });
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
        _form_snapshot: { ...record.form_snapshot, receiver_signature: sig },
      });
      if (error) throw error;

      setDone(true);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">טוען...</div>;
  if (!record) return <div className="min-h-screen flex items-center justify-center text-destructive">קישור לא תקף</div>;

  if (done || record.status === "signed") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h1 className="text-2xl font-bold mb-2">הטופס נחתם בהצלחה</h1>
        <p className="text-muted-foreground">תודה. עותק נשמר בתיק שלך.</p>
        {record.pdf_url && (
          <a href={record.pdf_url} target="_blank" rel="noreferrer" className="mt-4 text-primary underline">
            הורד PDF
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-card border rounded-xl p-6">
          <h1 className="text-xl font-bold flex items-center gap-2 mb-1">
            <FileSignature className="w-6 h-6 text-primary" />
            חתימה על טופס קבלת ציוד
          </h1>
          <p className="text-sm text-muted-foreground">אנא קרא את הטופס וחתום למטה.</p>
        </div>

        <div className="bg-white rounded-xl shadow-card overflow-hidden">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              title="תצוגת הטופס"
              className="w-full"
              style={{ height: "85vh", border: 0 }}
            />
          ) : (
            <div className="p-12 text-center text-sm text-muted-foreground">טוען תצוגת טופס...</div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-6 space-y-4">
          <SignaturePad ref={sigRef} label="חתימתי על קבלת הציוד" height={180} />

          <div>
            <label className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70">
              <Upload className="w-4 h-4" />
              <span className="truncate">{attachment ? attachment.name : "צרף מסמך נוסף (אופציונלי)..."}</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
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
