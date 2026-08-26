import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  SUBSCRIPTION_PROVIDERS,
  SUBSCRIPTION_STATUS_LABELS,
  useSaveVehicleSubscription,
  type VehicleSubscription,
} from "@/hooks/useVehicleSubscriptions";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Target vehicle — private employee vehicle or a company asset. */
  employeeVehicleId?: string | null;
  assetId?: string | null;
  vehicleLabel?: string;
  subscription?: VehicleSubscription | null;
}

export function VehicleSubscriptionDialog({
  open,
  onOpenChange,
  employeeVehicleId,
  assetId,
  vehicleLabel,
  subscription,
}: Props) {
  const { toast } = useToast();
  const save = useSaveVehicleSubscription();
  const [provider, setProvider] = useState<string>(SUBSCRIPTION_PROVIDERS[0]);
  const [startDate, setStartDate] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setProvider(subscription?.provider ?? SUBSCRIPTION_PROVIDERS[0]);
    setStartDate(subscription?.start_date ?? "");
    setStatus(subscription?.status ?? "active");
    setNotes(subscription?.notes ?? "");
  }, [open, subscription]);

  const handleSave = async () => {
    try {
      await save.mutateAsync({
        id: subscription?.id,
        employee_vehicle_id: subscription ? subscription.employee_vehicle_id : employeeVehicleId ?? null,
        asset_id: subscription ? subscription.asset_id : assetId ?? null,
        provider,
        start_date: startDate || null,
        status,
        notes: notes.trim() || null,
      });
      toast({ title: subscription ? "המנוי עודכן" : "המנוי נוסף" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">
            {subscription ? "עריכת מנוי" : "מנוי חדש"}
            {vehicleLabel ? ` — ${vehicleLabel}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">ספק</Label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full mt-1 h-10 px-2 rounded-md border border-input bg-background text-sm"
            >
              {SUBSCRIPTION_PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">תאריך התחלה</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 text-left" dir="ltr" />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full mt-1 h-10 px-2 rounded-md border border-input bg-background text-sm"
            >
              {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">הערות</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button onClick={handleSave} disabled={save.isPending}>שמור</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
