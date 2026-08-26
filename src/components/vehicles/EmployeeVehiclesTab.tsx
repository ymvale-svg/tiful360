import { useMemo, useState } from "react";
import { Car, Plus, Pencil, Trash2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useEmployeeAssets } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { VehicleSubscriptionDialog } from "./VehicleSubscriptionDialog";
import {
  SUBSCRIPTION_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  useDeleteEmployeeVehicle,
  useDeleteVehicleSubscription,
  useEmployeeVehicles,
  useSaveEmployeeVehicle,
  useVehicleSubscriptions,
  vehicleTypeFromGroupName,
  type VehicleSubscription,
} from "@/hooks/useVehicleSubscriptions";

interface Props {
  employeeId: string;
  canEdit: boolean;
}

const statusClass: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

export function EmployeeVehiclesTab({ employeeId, canEdit }: Props) {
  const { toast } = useToast();
  const { data: vehicles } = useEmployeeVehicles(employeeId);
  const { data: subscriptions } = useVehicleSubscriptions();
  const { data: assets } = useEmployeeAssets(employeeId);
  const { data: groups } = useAssetGroups();
  const saveVehicle = useSaveEmployeeVehicle();
  const deleteVehicle = useDeleteEmployeeVehicle();
  const deleteSubscription = useDeleteVehicleSubscription();

  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [notes, setNotes] = useState("");
  const [subDialog, setSubDialog] = useState<{
    employeeVehicleId?: string | null;
    assetId?: string | null;
    label?: string;
    subscription?: VehicleSubscription | null;
  } | null>(null);

  const companyVehicles = useMemo(
    () => (assets ?? []).filter((a: any) => a.asset_categories?.protocol_type === "vehicle"),
    [assets]
  );

  const groupName = (groupId?: string | null) => (groups ?? []).find((g) => g.id === groupId)?.name ?? null;

  const subsForPrivate = (vehicleId: string) =>
    (subscriptions ?? []).filter((s) => s.employee_vehicle_id === vehicleId);
  const subsForAsset = (assetId: string) => (subscriptions ?? []).filter((s) => s.asset_id === assetId);

  const startAdd = () => {
    setAddingVehicle(true);
    setEditingVehicleId(null);
    setPlate("");
    setNotes("");
  };
  const startEdit = (v: any) => {
    setAddingVehicle(false);
    setEditingVehicleId(v.id);
    setPlate(v.license_plate);
    setNotes(v.notes ?? "");
  };
  const cancelForm = () => {
    setAddingVehicle(false);
    setEditingVehicleId(null);
  };

  const submitVehicle = async () => {
    if (!plate.trim()) {
      toast({ title: "יש להזין מס' רכב", variant: "destructive" });
      return;
    }
    try {
      await saveVehicle.mutateAsync({
        id: editingVehicleId ?? undefined,
        employee_id: employeeId,
        license_plate: plate.trim(),
        notes: notes.trim() || null,
      });
      toast({ title: editingVehicleId ? "הרכב עודכן" : "הרכב נוסף" });
      cancelForm();
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  const removeVehicle = async (id: string) => {
    if (!confirm("למחוק את הרכב וכל המנויים שלו?")) return;
    try {
      await deleteVehicle.mutateAsync(id);
      toast({ title: "הרכב נמחק" });
    } catch (e: any) {
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
    }
  };

  const removeSubscription = async (id: string) => {
    if (!confirm("למחוק את המנוי?")) return;
    try {
      await deleteSubscription.mutateAsync(id);
      toast({ title: "המנוי נמחק" });
    } catch (e: any) {
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
    }
  };

  const SubscriptionsList = ({
    subs,
    onAdd,
  }: {
    subs: VehicleSubscription[];
    onAdd: () => void;
  }) => (
    <div className="mt-3 space-y-2">
      {subs.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין מנויים לרכב זה</p>
      ) : (
        subs.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <Ticket className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm">{s.provider}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[s.status] ?? ""}`}>
              {SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status}
            </span>
            <span className="text-xs text-muted-foreground">
              {s.start_date ? new Date(s.start_date).toLocaleDateString("en-GB") : "ללא תאריך התחלה"}
            </span>
            {s.notes && <span className="text-xs text-muted-foreground truncate max-w-[16rem]">{s.notes}</span>}
            {canEdit && (
              <div className="ms-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => setSubDialog({ subscription: s })} aria-label="ערוך מנוי">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeSubscription(s.id)} aria-label="מחק מנוי">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            )}
          </div>
        ))
      )}
      {canEdit && (
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" />
          הוסף מנוי
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">רכבים ומנויים</h2>
        {canEdit && !addingVehicle && (
          <Button size="sm" className="gap-1.5" onClick={startAdd}>
            <Plus className="w-4 h-4" />
            רכב פרטי
          </Button>
        )}
      </div>

      {(addingVehicle || editingVehicleId) && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">מס' רכב פרטי</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} className="mt-1 text-left" dir="ltr" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={submitVehicle} disabled={saveVehicle.isPending}>שמור</Button>
            <Button size="sm" variant="ghost" onClick={cancelForm}>ביטול</Button>
          </div>
        </div>
      )}

      {(vehicles ?? []).map((v) => (
        <div key={v.id} className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Car className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono font-semibold">{v.license_plate}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {VEHICLE_TYPE_LABELS.private}
            </span>
            {v.notes && <span className="text-xs text-muted-foreground">{v.notes}</span>}
            {canEdit && (
              <div className="ms-auto flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => startEdit(v)} aria-label="ערוך רכב">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeVehicle(v.id)} aria-label="מחק רכב">
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            )}
          </div>
          <SubscriptionsList
            subs={subsForPrivate(v.id)}
            onAdd={() => setSubDialog({ employeeVehicleId: v.id, label: v.license_plate })}
          />
        </div>
      ))}

      {companyVehicles.map((a: any) => {
        const typeKey = vehicleTypeFromGroupName(groupName(a.group_id));
        return (
          <div key={a.id} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Car className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono font-semibold">{a.license_plate ?? a.asset_code}</span>
              <span className="text-sm">{a.asset_name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {VEHICLE_TYPE_LABELS[typeKey]}
              </span>
            </div>
            <SubscriptionsList
              subs={subsForAsset(a.id)}
              onAdd={() => setSubDialog({ assetId: a.id, label: a.license_plate ?? a.asset_name })}
            />
          </div>
        );
      })}

      {(vehicles ?? []).length === 0 && companyVehicles.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          לא נרשמו רכבים לעובד זה
        </div>
      )}

      <VehicleSubscriptionDialog
        open={!!subDialog}
        onOpenChange={(v) => !v && setSubDialog(null)}
        employeeVehicleId={subDialog?.employeeVehicleId}
        assetId={subDialog?.assetId}
        vehicleLabel={subDialog?.label}
        subscription={subDialog?.subscription}
      />
    </div>
  );
}
