import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Car, Plus, Pencil, Trash2, Ticket, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useEmployeeAssets } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { isVehicleLinkedGroup } from "@/lib/vehicleLinkedGroups";
import {
  VEHICLE_TYPE_LABELS,
  useDeleteEmployeeVehicle,
  useEmployeeVehicles,
  resolveVehiclePlate,
  useSaveEmployeeVehicle,
  vehicleTypeFromGroupName,
} from "@/hooks/useVehicleSubscriptions";

interface Props {
  employeeId: string;
  canEdit: boolean;
}

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};

export function EmployeeVehiclesTab({ employeeId, canEdit }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: vehicles } = useEmployeeVehicles(employeeId);
  const { data: assets } = useEmployeeAssets(employeeId);
  const { data: groups } = useAssetGroups();
  const saveVehicle = useSaveEmployeeVehicle();
  const deleteVehicle = useDeleteEmployeeVehicle();

  const [addingVehicle, setAddingVehicle] = useState(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [plate, setPlate] = useState("");
  const [notes, setNotes] = useState("");

  const companyVehicles = useMemo(
    () => (assets ?? []).filter((a: any) => a.asset_categories?.protocol_type === "vehicle"),
    [assets]
  );

  const groupById = useMemo(
    () => new Map((groups ?? []).map((g) => [g.id, g])),
    [groups]
  );

  // Single source of truth: subscription items managed under Resources (שירותי מנוי)
  const subscriptionAssets = useMemo(
    () =>
      (assets ?? []).filter((a: any) =>
        isVehicleLinkedGroup(groupById.get(a.group_id) as any),
      ),
    [assets, groupById]
  );

  const groupName = (groupId?: string | null) => groupById.get(groupId ?? "")?.name ?? null;

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
    if (!confirm("למחוק את הרכב?")) return;
    try {
      await deleteVehicle.mutateAsync(id);
      toast({ title: "הרכב נמחק" });
    } catch (e: any) {
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
    }
  };

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
        </div>
      ))}

      {companyVehicles.map((a: any) => {
        const typeKey = vehicleTypeFromGroupName(groupName(a.group_id));
        return (
          <div key={a.id} className="bg-card border border-border rounded-xl p-4">
            <button
              type="button"
              onClick={() => navigate(`/assets/physical/${a.id}`)}
              className="flex items-center gap-3 flex-wrap w-full text-right hover:opacity-80 transition-opacity"
            >
              <Car className="w-4 h-4 text-muted-foreground" />
              <span className="font-mono font-semibold">{resolveVehiclePlate(a)}</span>
              <span className="text-sm">{a.asset_name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {VEHICLE_TYPE_LABELS[typeKey]}
              </span>
            </button>
          </div>
        );
      })}

      {(vehicles ?? []).length === 0 && companyVehicles.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          לא נרשמו רכבים לעובד זה
        </div>
      )}
    </div>
  );
}
