import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useReviewLeaveRequest } from "@/hooks/useLeaveRequests";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Paperclip, User } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר",
};
const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB");

interface Props {
  request: any | null;
  onClose: () => void;
}

export function ReviewLeaveRequestDialog({ request, onClose }: Props) {
  const review = useReviewLeaveRequest();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  if (!request) return null;

  const submit = async (approve: boolean) => {
    try {
      await review.mutateAsync({ request_id: request.id, approve, manager_note: note });
      toast({
        title: approve ? "הבקשה אושרה" : "הבקשה נדחתה",
        description: approve ? "נשלח אימייל לעובד ולמחלקת השכר" : "נשלח אימייל לעובד",
      });
      setNote("");
      onClose();
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>סקירת בקשה</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{request.employee?.full_name}</span>
            <span className="text-muted-foreground">• {request.employee?.department}</span>
          </div>
          <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">סוג:</span>
              <span className="font-medium">{TYPE_LABELS[request.request_type]}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span>
                {!request.end_date
                  ? `${fmt(request.start_date)} – טרם עודכן`
                  : request.start_date === request.end_date
                    ? fmt(request.start_date)
                    : `${fmt(request.start_date)} – ${fmt(request.end_date)}`}
              </span>
              <span className="text-muted-foreground">({request.total_days} ימים)</span>
            </div>
            {request.reason && (
              <p className="text-xs text-muted-foreground pt-1">{request.reason}</p>
            )}
            {request.attachment_url && (
              <a href={request.attachment_url} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-primary text-xs">
                <Paperclip className="w-3 h-3" />
                קובץ מצורף
              </a>
            )}
          </div>

          <div>
            <Label>הערת מנהל (אופציונלי)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>סגור</Button>
          <Button variant="destructive" onClick={() => submit(false)} disabled={review.isPending}>
            דחה
          </Button>
          <Button onClick={() => submit(true)} disabled={review.isPending}>
            {review.isPending ? "מעבד..." : "אשר"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
