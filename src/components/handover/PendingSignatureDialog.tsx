import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { signLinkFor, sendSignLink } from "@/lib/signLink";
import { formatDateDMY } from "@/lib/utils";
import { snapshotItemLabel } from "@/lib/pdf/formPdf";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, MessageCircle, Mail, Send, PenLine } from "lucide-react";

interface Props {
  formId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Handover-process status dialog for a form that awaits remote signing:
 * who it was sent to, when, and the direct signing link for manual sharing.
 */
export function PendingSignatureDialog({ formId, open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: form, isLoading } = useQuery({
    queryKey: ["pending-signature-form", formId],
    enabled: open && !!formId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("id, direction, status, created_at, sign_token, short_code, form_snapshot, employee_id, employees(full_name), assets(asset_name, asset_code)")
        .eq("id", formId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const link = form?.sign_token || form?.short_code ? signLinkFor(form?.sign_token, form?.short_code) : null;
  const itemName = form
    ? form.assets?.asset_name
      ? `${form.assets.asset_name}${form.assets.asset_code ? ` (${form.assets.asset_code})` : ""}`
      : (snapshotItemLabel(form.form_snapshot).name || "טופס מסירה")
    : "";
  const waitingDays = form
    ? Math.floor((Date.now() - new Date(form.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resend = async () => {
    if (!form || !link) return;
    setSending(true);
    const { sent } = await sendSignLink([form.id], [link]);
    setSending(false);
    if (sent) toast.success(`נשלח מייל ל${form.employees?.full_name || "עובד"} עם קישור לחתימה`);
    else toast.error("שליחת המייל נכשלה — אפשר לשתף את הקישור באופן עצמאי");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="w-4 h-4 text-primary" aria-hidden="true" />
            תהליך מסירה — ממתין לחתימה מרחוק
          </DialogTitle>
          <DialogDescription>
            הטופס נשלח לעובד וממתין לחתימה דיגיטלית.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="p-4 text-center text-sm text-muted-foreground">טוען פרטי טופס...</div>}

        {!isLoading && form && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">פריט</span>
                <span className="font-medium text-left">{itemName}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">עובד</span>
                <span className="font-medium">{form.employees?.full_name ?? "—"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">סוג פעולה</span>
                <span className="font-medium">{form.direction === "return" ? "החזרה" : "מסירה"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">נשלח לחתימה</span>
                <span className="font-medium">
                  {formatDateDMY(form.created_at)}
                  {waitingDays >= 1 ? ` (ממתין ${waitingDays} ימים)` : ""}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">סטטוס</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-warning/15 text-warning-foreground border-warning/40">
                  ממתין לחתימה
                </span>
              </div>
            </div>

            {link && (
              <div className="space-y-2">
                <div className="text-sm font-medium">קישור ישיר לחתימה מרחוק</div>
                <div className="flex gap-2">
                  <Input readOnly value={link} dir="ltr" className="text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" size="icon" onClick={copy}>
                    {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      window.open(
                        `https://wa.me/?text=${encodeURIComponent(`טופס לחתימה דיגיטלית: ${link}`)}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    <MessageCircle className="w-4 h-4 ml-1" /> שליחה בוואטסאפ
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      (window.location.href = `mailto:?subject=${encodeURIComponent("טופס לחתימה דיגיטלית")}&body=${encodeURIComponent(link)}`)
                    }
                  >
                    <Mail className="w-4 h-4 ml-1" /> שליחה במייל
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                    <ExternalLink className="w-4 h-4 ml-1" /> פתיחת הטופס
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={resend} disabled={sending}>
                    <Send className="w-4 h-4 ml-1" /> {sending ? "שולח..." : "שליחת מייל לעובד"}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              החתימה מתבצעת רק לאחר כניסת העובד לאזור האישי בפורטל.
            </p>
          </div>
        )}

        <div className="flex justify-start pt-2">
          <Button onClick={() => onOpenChange(false)}>סגירה</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
