import { useEffect, useRef, useState } from "react";
import { formatDateTimeDMY } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSignature, ExternalLink, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { buildPdfForFormSnapshot, snapshotItemLabel } from "@/lib/pdf/formPdf";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";
import { useToast } from "@/hooks/use-toast";

interface Props {
  employeeId: string;
}

export function PendingHandoverForms({ employeeId }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [active, setActive] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const { data: pending } = useQuery({
    queryKey: ["pending-handover", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
  });

  // Live preview as user signs
  useEffect(() => {
    if (!active) { setPreviewUrl(null); return; }
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const blob = await buildPdfForFormSnapshot(active.form_snapshot, sigUrl);
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return createdUrl; });
      } catch (e) { console.error("preview pdf failed", e); }
    })();
    return () => { cancelled = true; if (createdUrl) URL.revokeObjectURL(createdUrl); };
  }, [active, sigUrl]);

  const handleSign = async () => {
    if (!active) return;
    const sig = sigRef.current?.getDataUrl();
    if (!sig) {
      toast({ title: "נא לחתום בקנבס", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setSigUrl(sig);

      const blob = await buildPdfForFormSnapshot(active.form_snapshot, sig);
      const pdfPath = `${active.company_id}/${active.employee_id}/${active.asset_id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("handover-forms")
        .upload(pdfPath, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      // Private bucket: persist the path, not a public URL.
      const pdfUrl = pdfPath;

      const { error } = await supabase
        .from("asset_handover_forms")
        .update({
          status: "signed",
          signature_data: sig,
          pdf_url: pdfUrl,
          signed_at: new Date().toISOString(),
          form_snapshot: { ...active.form_snapshot, receiver_signature: sig, employee_signature: sig },
        })
        .eq("id", active.id);
      if (error) throw error;

      const snap: any = active.form_snapshot ?? {};
      const { data: emp } = await supabase
        .from("employees")
        .select("email, full_name")
        .eq("id", active.employee_id)
        .maybeSingle();
      if (emp?.email) {
        supabase.functions.invoke("send-handover-protocol-email", {
          body: {
            employeeId: active.employee_id,
            idempotencyKey: `handover-form-${active.id}`,

            templateData: {
              employeeName: emp.full_name ?? snap.employee_name ?? "",
              companyName: snap.company_name ?? "",
              itemName: snapshotItemLabel(snap).name,
              itemCode: snapshotItemLabel(snap).code,
              direction: active.direction ?? "handover",
              title: snap.title ?? null,
              issuerName: snap.issuer_name ?? "",
              issuedAt: formatDateTimeDMY(new Date()),
              fields: (snap.fields ?? []).map((f: any) => ({ label: f.label, value: String(f.value ?? "") })),
              notes: snap.free_text ?? null,
              pdfUrl,
              portalUrl: `${window.location.origin}/portal`,
            },
          },
        }).catch((e) => console.error("protocol email failed", e));
      }

      // Let the person who sent the form know it was signed (same as the remote link flow).
      if (active.sign_token) {
        void supabase.functions
          .invoke("notify-form-signed", { body: { token: active.sign_token } })
          .catch(() => undefined);
      }

      toast({ title: "נחתם בהצלחה", description: "המסמך נשמר באזור האישי ונשלח אליך במייל" });
      qc.invalidateQueries({ queryKey: ["pending-handover", employeeId] });
      qc.invalidateQueries({ queryKey: ["handover-forms"] });
      setActive(null); setSigUrl(null);

    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (!pending || pending.length === 0) return null;

  return (
    <>
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-warning">
          <FileSignature className="w-4 h-4" />
          טפסי קבלת ציוד לחתימה ({pending.length})
        </div>
        {pending.map((row: any) => (
          <div key={row.id} className="bg-card rounded-lg border border-border/50 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{snapshotItemLabel(row.form_snapshot).name}</p>
              <p className="text-xs text-muted-foreground">{snapshotItemLabel(row.form_snapshot).code}</p>
            </div>
            <Button size="sm" className="gap-1" onClick={() => { setSigUrl(null); setActive(row); }}>
              <ExternalLink className="w-3 h-3" />
              חתום
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => { if (!o) { setActive(null); setSigUrl(null); } }}>
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-primary" />
              חתימה על טופס קבלת ציוד
            </DialogTitle>
          </DialogHeader>

          {active && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden bg-white">
                {previewUrl ? (
                  <iframe src={previewUrl} title="תצוגת הטופס" className="w-full" style={{ height: "65vh", border: 0 }} />
                ) : (
                  <div className="p-12 text-center text-sm text-muted-foreground">טוען תצוגת טופס...</div>
                )}
              </div>
              <SignaturePad ref={sigRef} label="חתימתי" height={180} />
              <Button className="w-full gap-2" disabled={busy} onClick={handleSign}>
                <CheckCircle2 className="w-4 h-4" />
                {busy ? "שומר..." : "אישור וחתימה"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
