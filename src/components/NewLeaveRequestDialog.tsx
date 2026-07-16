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

  const isSick = type === "sick";
  const days = calcDays(start, end);
  // For sick without end date - 1 day (start day) as provisional
  const provisionalDays = isSick && start && !end ? 1 : days;

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
        end_date: end || null,
        total_days: provisionalDays,
        reason,
        attachment_file: file,
      });
      toast({
        title: "הבקשה נשלחה",
        description: isSick && !end
          ? "המנהל הישיר ומשאבי אנוש קיבלו עדכון. ניתן לעדכן תאריך סיום ואישור מחלה בהמשך"
          : isSick
          ? "המנהל הישיר, משאבי אנוש וחשבות שכר קיבלו עדכון"
          : "המנהל הישיר קיבל אימייל",
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!start) {
      toast({ title: "יש לבחור תאריך התחלה", variant: "destructive" });
      return;
    }
    if (!isSick) {
      if (!end || days <= 0) {
        toast({ title: "תאריכים לא תקינים", variant: "destructive" });
        return;
      }
    } else if (end && days <= 0) {
      toast({ title: "תאריכים לא תקינים", variant: "destructive" });
      return;
    }
    if (isSick && !file && end) {
      // finalized sick without attachment
      setConfirmSickOpen(true);
      return;
    }
    doSubmit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>בקשה חדשה</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <fieldset>
              <legend className="text-sm font-medium mb-1">סוג בקשה</legend>
              <div role="radiogroup" aria-label="סוג בקשה" className="grid grid-cols-4 gap-2 mt-1">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={type === t.value}
                    onClick={() => setType(t.value)}
                    className={`text-xs py-2 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      type === t.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="leave-start">מתאריך</Label>
                <Input id="leave-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required aria-required="true" />
              </div>
              <div>
                <Label htmlFor="leave-end">עד תאריך</Label>
                <Input id="leave-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required aria-required="true" />
              </div>
            </div>

            {provisionalDays > 0 && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {isSick && !end ? 'תאריך סיום טרם עודכן' : <>סה"כ ימים: <strong className="text-foreground">{provisionalDays}</strong></>}
              </p>
            )}

            <div>
              <Label htmlFor="leave-reason">סיבה / הערות</Label>
              <Textarea id="leave-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
            </div>

            <div>
              <Label htmlFor="leave-file">{isSick ? "אישור מחלה (ניתן להעלות בהמשך)" : "קובץ מצורף (אופציונלי)"}</Label>
              <label htmlFor="leave-file" className="mt-1 flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg cursor-pointer hover:bg-muted text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <Upload className="w-4 h-4" aria-hidden="true" />
                {file ? file.name : "בחר קובץ..."}
                <input
                  id="leave-file"
                  type="file"
                  className="sr-only"
                  accept="image/*,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
              <Button type="submit" disabled={create.isPending} aria-busy={create.isPending}>
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
              ניתן להעלות את האישור גם בהמשך מתוך הבקשה.
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
