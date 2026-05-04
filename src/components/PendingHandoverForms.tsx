import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSignature, ExternalLink, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { HandoverFormData } from "@/lib/pdf/types";
import { buildHandoverPdf } from "@/lib/pdf/buildHandoverPdf";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { PdfPreview } from "./PdfPreview";

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
        const blob = await buildHandoverPdf({
          ...(active.form_snapshot as HandoverFormData),
          receiver_signature: sigUrl,
        });
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

      const blob = await buildHandoverPdf({
        ...(active.form_snapshot as HandoverFormData),
        receiver_signature: sig,
      });
      const pdfPath = `${active.company_id}/${active.employee_id}/${active.asset_id}-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("handover-forms")
        .upload(pdfPath, blob, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("handover-forms").getPublicUrl(pdfPath);
      const pdfUrl = pub.publicUrl;

      const { error } = await supabase
        .from("asset_handover_forms")
        .update({
          status: "signed",
          signature_data: sig,
          pdf_url: pdfUrl,
          signed_at: new Date().toISOString(),
          form_snapshot: { ...active.form_snapshot, receiver_signature: sig },
        })
        .eq("id", active.id);
      if (error) throw error;

      toast({ title: "נחתם בהצלחה", description: "המסמך נשמר בתיק שלך" });
      qc.invalidateQueries({ queryKey: ["pending-handover", employeeId] });
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
              <p className="text-sm font-medium truncate">{row.form_snapshot?.asset_name}</p>
              <p className="text-xs text-muted-foreground">{row.form_snapshot?.asset_code}</p>
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
              <PdfPreview src={previewUrl} title="תצוגת הטופס" height="65vh" />
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
