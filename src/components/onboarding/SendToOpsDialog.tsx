import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { useToast } from "@/hooks/use-toast";
import { useSendOnboardingToOps } from "@/hooks/useOnboardingProtocol";
import { Send, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processId: string | null;
  employeeId: string | null;
  employeeName?: string | null;
  itemCount?: number;
  onSent?: () => void;
}

/**
 * Confirms sending the onboarding needs form to operations:
 * captures the HR requester signature, produces the audit-grade protocol,
 * files it in the employee documents, opens the service ticket and notifies
 * operations, IT and HR.
 */
export function SendToOpsDialog({
  open,
  onOpenChange,
  processId,
  employeeId,
  employeeName,
  itemCount,
  onSent,
}: Props) {
  const { toast } = useToast();
  const sigRef = useRef<SignaturePadHandle>(null);
  const send = useSendOnboardingToOps();
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    if (!processId || !employeeId) return;
    const signature = sigRef.current?.getDataUrl() ?? null;
    if (!signature) {
      toast({ title: "נדרשת חתימת מבקש", description: "חתמו במסגרת לפני השליחה", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await send.mutateAsync({ processId, employeeId, signature });
      toast({
        title: "נשלח לתפעול",
        description: "הפרוטוקול נשמר בתיק העובד ונפתחה קריאת שירות",
      });
      if (res.mailErr) {
        toast({
          title: "שים לב",
          description: "שליחת המייל נכשלה — בדקו את הגדרות הדיוור",
          variant: "destructive",
        });
      } else if ((res.mailData as any)?.warning) {
        toast({
          title: "שים לב",
          description: "לא הוגדרו כתובות מייל לתפעול/IT/משאבי אנוש",
          variant: "destructive",
        });
      }
      onOpenChange(false);
      onSent?.();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            שליחת בקשה לתפעול
          </DialogTitle>
          <DialogDescription>
            יופק פרוטוקול בקשת פתיחת הרשאות וציוד עבור {employeeName || "העובד"}
            {typeof itemCount === "number" ? ` (${itemCount} פריטים)` : ""}, יישמר במסמכי תיק העובד,
            תיפתח קריאת שירות ויישלח עותק לתפעול, ל-IT ולמשאבי אנוש.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          <SignaturePad ref={sigRef} label="חתימת מבקש (משאבי אנוש)" height={150} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            ביטול
          </Button>
          <Button onClick={handleSend} disabled={busy} className="gap-1.5">
            <Send className="w-4 h-4" />
            {busy ? "מפיק ושולח..." : "הפק ושלח"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
