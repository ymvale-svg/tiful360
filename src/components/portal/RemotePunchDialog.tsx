import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { useCreateRemotePunch } from "@/hooks/useAttendancePunches";
import { useToast } from "@/hooks/use-toast";
import { LogIn, LogOut, MapPin } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  direction: "in" | "out";
  employee: { id: string; company_id: string; employee_code: string; full_name: string };
}

export function RemotePunchDialog({ open, onOpenChange, direction, employee }: Props) {
  const sigRef = useRef<SignaturePadHandle>(null);
  const [note, setNote] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"idle" | "loading" | "ok" | "denied">("idle");
  const create = useCreateRemotePunch();
  const { toast } = useToast();

  const captureGeo = () => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setGeoStatus("ok");
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  // אוטומטית מבקש מיקום בפתיחת הדיאלוג
  useEffect(() => {
    if (open && geoStatus === "idle") captureGeo();
    if (!open) {
      setGeo(null);
      setGeoStatus("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const sig = sigRef.current?.getDataUrl();
    if (!sig) {
      toast({ title: "חתימה חסרה", description: "נא לחתום לפני שליחה", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({
        companyId: employee.company_id,
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        direction,
        signatureDataUrl: sig,
        note: note.trim() || undefined,
        geo,
      });
      toast({ title: direction === "in" ? "כניסה נרשמה ✓" : "יציאה נרשמה ✓" });
      sigRef.current?.clear();
      setNote("");
      setGeo(null);
      setGeoStatus("idle");
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה בשליחה", description: err.message, variant: "destructive" });
    }
  };

  const isIn = direction === "in";
  const Icon = isIn ? LogIn : LogOut;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5" />
            {isIn ? "דיווח כניסה" : "דיווח יציאה"} — מרחוק
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            {employee.full_name} • {new Date().toLocaleString("he-IL")}
          </div>

          <SignaturePad label="חתימה דיגיטלית" height={140} ref={sigRef} />

          <div>
            <Label className="text-xs">הערה (אופציונלי)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="לדוגמה: באתר לקוח X"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <Button type="button" variant="outline" size="sm" onClick={captureGeo} className="gap-1">
              <MapPin className="w-3 h-3" />
              {geoStatus === "loading" ? "מאתר..." : "צרף מיקום"}
            </Button>
            <span className="text-muted-foreground">
              {geoStatus === "ok" && geo && `נשמר: ${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`}
              {geoStatus === "denied" && "אישור מיקום נדחה"}
            </span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button className="flex-1" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "שולח..." : isIn ? "אישור כניסה" : "אישור יציאה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
