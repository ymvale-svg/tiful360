import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCreateLeaveRequest, type LeaveRequestType } from "@/hooks/useLeaveRequests";
import { Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  managerId: string | null;
}

const TYPES: { value: LeaveRequestType; label: string }[] = [
  { value: "vacation", label: "חופשה" },
  { value: "sick", label: "מחלה" },
  { value: "personal", label: "יום אישי" },
  { value: "other", label: "אחר" },
];

function calcDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start);
  const b = new Date(end);
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

export function NewLeaveRequestDialog({ open, onOpenChange, employeeId, managerId }: Props) {
  const { toast } = useToast();
  const create = useCreateLeaveRequest();
  const [type, setType] = useState<LeaveRequestType>("vacation");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmSickOpen, setConfirmSickOpen] = useState(false);

  const days = calcDays(start, end);

  const reset = () => {
    setType("vacation"); setStart(""); setEnd(""); setReason(""); setFile(null);
  };

  const doSubmit = async () => {
    try {
      await create.mutateAsync({
        employee_id: employeeId,
        manager_id: managerId,
        request_type: type,
        start_date: start,
        end_date: end,
        total_days: days,
        reason,
        attachment_file: file,
      });
      toast({ title: "הבקשה נשלחה", description: "המנהל הישיר קיבל אימייל" });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end || days <= 0) {
      toast({ title: "תאריכים לא תקינים", variant: "destructive" });
      return;
    }
    if (type === "sick" && !file) {
      setConfirmSickOpen(true);
      return;
    }
    doSubmit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>בקשה חדשה</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>סוג בקשה</Label>
              <div className="grid grid-cols-4 gap-2 mt-1">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`text-xs py-2 rounded-lg border transition-colors ${
                      type === t.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מתאריך</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
              </div>
              <div>
                <Label>עד תאריך</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </div>
            </div>

            {days > 0 && (
              <p className="text-xs text-muted-foreground">סה"כ ימים: <strong className="text-foreground">{days}</strong></p>
            )}

            <div>
              <Label>סיבה / הערות</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>

            <div>
              <Label>{type === "sick" ? "אישור מחלה (מומלץ)" : "קובץ מצורף (אופציונלי)"}</Label>
              <label className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-sm text-muted-foreground">
                <Upload className="w-4 h-4" />
                {file ? file.name : "בחר קובץ..."}
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "שולח..." : "שליחה"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmSickOpen} onOpenChange={setConfirmSickOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>שליחה ללא אישור מחלה</AlertDialogTitle>
            <AlertDialogDescription>
              לא צירפת אישור מחלה. <strong>זיכוי הימים מותנה בהמצאת אישור מחלה</strong> לימים שהוצהרו.
              להמשיך בכל זאת?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזור</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmSickOpen(false); doSubmit(); }}>
              המשך ושלח
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
