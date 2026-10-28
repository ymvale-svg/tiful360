import { useEffect, useState } from "react";
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
import { FormField, focusFirstInvalid } from "@/components/feedback/FormField";
import { FileDrop } from "@/components/feedback/FileDrop";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employeeId: string;
  managerId: string | null;
  /** Which type the dialog opens on, e.g. "sick" from the portal's sick-report tile. */
  initialType?: LeaveRequestType;
}

const TYPES: { value: LeaveRequestType; label: string }[] = [
  { value: "vacation", label: "חופשה" },
  { value: "sick", label: "מחלה" },
  { value: "reserve", label: "מילואים" },
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

export function NewLeaveRequestDialog({ open, onOpenChange, employeeId, managerId, initialType = "vacation" }: Props) {
  const { toast } = useToast();
  const create = useCreateLeaveRequest();
  const [type, setType] = useState<LeaveRequestType>(initialType);
  // Each opening starts on the type its entry point asked for ("דיווח מחלה" → sick).
  useEffect(() => { if (open) setType(initialType); }, [open, initialType]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmSickOpen, setConfirmSickOpen] = useState(false);
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({});
  const isDirty = !!(start || end || reason || file);
  const guard = useDirtyGuard(isDirty, create.isPending);
  const close = guard((v: boolean) => { if (!v) setErrors({}); onOpenChange(v); });

  const isSick = type === "sick";
  const days = calcDays(start, end);
  // For sick without end date - 1 day (start day) as provisional
  const provisionalDays = isSick && start && !end ? 1 : days;

  const reset = () => {
    setType(initialType); setStart(""); setEnd(""); setReason(""); setFile(null); setErrors({});
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
        description: isSick
          ? "המנהל הישיר, משאבי אנוש וחשבות שכר קיבלו עדכון"
          : "המנהל הישיר קיבל אימייל",
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const next: { start?: string; end?: string } = {};
    if (!start) next.start = "יש לבחור תאריך התחלה";
    if (type === "vacation" && !end) next.end = "יש לבחור תאריך סיום לחופשה";
    else if (end && start && days <= 0) next.end = "תאריך הסיום מוקדם מתאריך ההתחלה";
    setErrors(next);
    if (next.start || next.end) {
      requestAnimationFrame(() => focusFirstInvalid(form));
      return;
    }
    if (isSick && !file) {
      setConfirmSickOpen(true);
      return;
    }
    doSubmit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>בקשה חדשה</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="space-y-3">
            <fieldset>
              <legend className="text-sm font-medium mb-1">סוג בקשה</legend>
              <div role="radiogroup" aria-label="סוג בקשה" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={type === t.value}
                    onClick={() => setType(t.value)}
                    className={`text-sm min-h-10 py-2 rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="מתאריך" required error={errors.start}>
                <Input
                  id="leave-start"
                  type="date"
                  value={start}
                  onChange={(e) => { setStart(e.target.value); if (errors.start) setErrors((p) => ({ ...p, start: undefined })); }}
                />
              </FormField>
              <FormField label={`עד תאריך${type !== "vacation" ? " (אופציונלי)" : ""}`} required={type === "vacation"} error={errors.end}>
                <Input
                  id="leave-end"
                  type="date"
                  value={end}
                  min={start || undefined}
                  onChange={(e) => { setEnd(e.target.value); if (errors.end) setErrors((p) => ({ ...p, end: undefined })); }}
                />
              </FormField>
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
              <p className="text-sm font-medium mb-1.5">{isSick ? "אישור מחלה (ניתן להעלות בהמשך)" : "קובץ מצורף (אופציונלי)"}</p>
              <FileDrop
                id="leave-file"
                accept="image/*,.pdf"
                onFiles={(files) => setFile(files[0] ?? null)}
                title={file ? file.name : "גררו קובץ לכאן או לחצו לבחירה"}
                hint={file ? "לחצו או גררו קובץ אחר כדי להחליף" : "תמונה או PDF"}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={create.isPending}>ביטול</Button>
              <Button type="submit" loading={create.isPending} loadingText="שולח…">
                שליחה
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
