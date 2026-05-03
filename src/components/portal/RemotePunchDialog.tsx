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
    if (!geo) {
      toast({
        title: "מיקום חסר",
        description: "יש לאשר שיתוף מיקום GPS לפני שליחת ההחתמה",
        variant: "destructive",
      });
      captureGeo();
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

          <div className="rounded-md border p-2 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 font-medium">
                <MapPin className="w-3 h-3" />
                מיקום GPS {geoStatus !== "ok" && <span className="text-destructive">*חובה</span>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={captureGeo} className="h-6 text-xs">
                {geoStatus === "loading" ? "מאתר..." : geoStatus === "ok" ? "רענן" : "אתר עכשיו"}
              </Button>
            </div>
            <div className="text-muted-foreground">
              {geoStatus === "loading" && "מאתר את מיקומך..."}
              {geoStatus === "ok" && geo && (
                <a
                  href={`https://www.google.com/maps?q=${geo.lat},${geo.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}
                  {geo.accuracy ? ` (±${Math.round(geo.accuracy)} מ׳)` : ""}
                </a>
              )}
              {geoStatus === "denied" && "אישור מיקום נדחה — יש לאפשר גישה למיקום בדפדפן"}
              {geoStatus === "idle" && "לחץ על 'אתר עכשיו' כדי לשתף מיקום"}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button className="flex-1" onClick={submit} disabled={create.isPending || !geo}>
              {create.isPending ? "שולח..." : isIn ? "אישור כניסה" : "אישור יציאה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
