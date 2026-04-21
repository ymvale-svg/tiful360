import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAttendanceCorrection } from "@/hooks/useAttendanceCorrections";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  managerId?: string | null;
  initiatedBy: "employee" | "manager";
}

export function AttendanceCorrectionDialog({ open, onClose, employeeId, managerId, initiatedBy }: Props) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [origIn, setOrigIn] = useState("");
  const [origOut, setOrigOut] = useState("");
  const [reqIn, setReqIn] = useState("");
  const [reqOut, setReqOut] = useState("");
  const [reason, setReason] = useState("");
  const create = useCreateAttendanceCorrection();
  const { toast } = useToast();

  const submit = async () => {
    if (!date || !reason.trim()) {
      toast({ title: "יש למלא תאריך וסיבה", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        employee_id: employeeId,
        manager_id: managerId ?? null,
        correction_date: date,
        original_check_in: origIn || null,
        original_check_out: origOut || null,
        requested_check_in: reqIn || null,
        requested_check_out: reqOut || null,
        reason,
        initiated_by: initiatedBy,
      });
      toast({ title: "בקשת התיקון נשלחה" });
      onClose();
      setOrigIn(""); setOrigOut(""); setReqIn(""); setReqOut(""); setReason("");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>בקשת תיקון שעון נוכחות</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>תאריך</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>כניסה מקורית</Label>
              <Input type="time" value={origIn} onChange={(e) => setOrigIn(e.target.value)} />
            </div>
            <div>
              <Label>יציאה מקורית</Label>
              <Input type="time" value={origOut} onChange={(e) => setOrigOut(e.target.value)} />
            </div>
            <div>
              <Label>כניסה מבוקשת</Label>
              <Input type="time" value={reqIn} onChange={(e) => setReqIn(e.target.value)} />
            </div>
            <div>
              <Label>יציאה מבוקשת</Label>
              <Input type="time" value={reqOut} onChange={(e) => setReqOut(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>סיבה</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="תאר/י בקצרה את הסיבה לתיקון" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "שולח..." : "שלח בקשה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
