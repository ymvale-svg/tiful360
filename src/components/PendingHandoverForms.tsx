import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FileSignature, ExternalLink, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { HandoverFormView, HandoverFormData } from "./HandoverFormView";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";
import { generateAndUploadHandoverPdf } from "@/lib/generateHandoverPdf";
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
  const formRef = useRef<HTMLDivElement>(null);
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

  const handleSign = async () => {
    if (!active || !formRef.current) return;
    const sig = sigRef.current?.getDataUrl();
    if (!sig) {
      toast({ title: "נא לחתום בקנבס", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      setSigUrl(sig);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      const pdfPath = `${active.company_id}/${active.employee_id}/${active.asset_id}-${Date.now()}.pdf`;
      const pdfUrl = await generateAndUploadHandoverPdf(formRef.current, pdfPath);

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
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
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
              <div className="border rounded-lg overflow-auto bg-muted/30 p-4">
                <div style={{ transform: "scale(0.75)", transformOrigin: "top center" }}>
                  <HandoverFormView ref={formRef} data={{ ...active.form_snapshot, receiver_signature: sigUrl } as HandoverFormData} />
                </div>
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
