import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUpdateSickLeaveRequest } from "@/hooks/useLeaveRequests";
import { Upload, Paperclip } from "lucide-react";

interface Props {
  request: any | null;
  onClose: () => void;
}

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function EditSickLeaveDialog({ request, onClose }: Props) {
  const { toast } = useToast();
  const update = useUpdateSickLeaveRequest();
  const [end, setEnd] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setEnd(request?.end_date ?? "");
    setFile(null);
  }, [request?.id]);

  if (!request) return null;

  const days = calcDays(request.start_date, end);
  const hasExistingAttachment = !!request.attachment_url;
  const alreadyClosed = !!request.end_date;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (end && days <= 0) {
      toast({ title: "תאריך סיום לא תקין", variant: "destructive" });
      return;
    }
    if (!end && !file) {
      toast({ title: "אין מה לעדכן", description: "בחר תאריך סיום או צרף אישור מחלה", variant: "destructive" });
      return;
    }
    try {
      await update.mutateAsync({
        request_id: request.id,
        employee_id: request.employee_id,
        end_date: end && end !== request.end_date ? end : null,
        total_days: end && end !== request.end_date ? days : null,
        attachment_file: file,
      });
      toast({
        title: "המחלה עודכנה",
        description: end && !alreadyClosed ? "נשלח עדכון למנהל, משאבי אנוש וחשבות שכר" : "הפרטים נשמרו",
      });
      onClose();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>עדכון דיווח מחלה</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">
            תחילת המחלה: <strong>{new Date(request.start_date).toLocaleDateString("en-GB")}</strong>
          </p>

          <div>
            <Label htmlFor="sick-end">תאריך סיום מחלה</Label>
            <Input id="sick-end" type="date" value={end} min={request.start_date}
                   onChange={(e) => setEnd(e.target.value)} />
            {days > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                סה"כ ימים: <strong className="text-foreground">{days}</strong>
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="sick-file">
              {hasExistingAttachment ? "החלפת אישור מחלה" : "העלאת אישור מחלה"}
            </Label>
            {hasExistingAttachment && (
              <a href={request.attachment_url} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-primary text-xs my-1">
                <Paperclip className="w-3 h-3" />
                אישור קיים
              </a>
            )}
            <label htmlFor="sick-file" className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-sm text-muted-foreground">
              <Upload className="w-4 h-4" aria-hidden="true" />
              {file ? file.name : "בחר קובץ..."}
              <input id="sick-file" type="file" className="sr-only" accept="image/*,.pdf"
                     onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={update.isPending} aria-busy={update.isPending}>
              {update.isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
