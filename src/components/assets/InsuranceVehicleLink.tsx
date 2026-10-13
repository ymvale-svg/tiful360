import { useEffect, useMemo, useState } from "react";
import { Car } from "lucide-react";
import { useAssets, useEmployees } from "@/hooks/useData";
import { useEmployeeVehicles } from "@/hooks/useVehicleSubscriptions";
import { useUpdateAsset } from "@/hooks/useMutations";
import { collectEmployeeVehicles } from "@/lib/vehicleLinkedGroups";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";

export const INS_EMP_KEY = "linked_employee_id";
export const INS_PLATE_KEY = "linked_vehicle_plate";

/** Car insurance sub-categories ("ביטוח רכב" etc.). */
export function isCarInsuranceGroup(group: { name?: string | null } | null | undefined): boolean {
  return !!group?.name && group.name.includes("רכב");
}

interface PickerProps {
  employeeId: string;
  plate: string;
  onChange: (employeeId: string, plate: string) => void;
}

export function InsuranceVehiclePicker({ employeeId, plate, onChange }: PickerProps) {
  const { data: employees } = useEmployees();
  const { data: assets } = useAssets();
  const { data: personal } = useEmployeeVehicles(employeeId || undefined);
  const vehicles = useMemo(
    () => collectEmployeeVehicles(assets, personal, employeeId || null),
    [assets, personal, employeeId],
  );
  const active = (employees ?? []).filter((e: any) => e.status !== "terminated");

  return (
    <div className="grid grid-cols-2 gap-3" dir="rtl">
      <div>
        <label className="text-sm font-medium mb-1 block">עובד</label>
        <SearchableSelect
          value={employeeId}
          onChange={(v) => onChange(v, "")}
          options={[
            { value: "", label: "ללא שיוך" },
            ...active.map((e: any) => ({ value: e.id, label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ""}` })),
          ]}
          placeholder="בחר עובד"
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">רכב מבוטח</label>
        <SearchableSelect
          value={plate}
          onChange={(v) => onChange(employeeId, v)}
          options={[
            { value: "", label: !employeeId ? "בחר עובד תחילה" : vehicles.length ? "בחר רכב" : "לעובד אין רכב" },
            ...vehicles.map((v) => ({
              value: v.license_plate,
              label: `${v.license_plate}${v.manufacturer_model || v.asset_name ? ` — ${v.manufacturer_model || v.asset_name}` : ""}${v.source === "personal" ? " (פרטי)" : ""}`,
            })),
          ]}
          placeholder="בחר רכב"
        />
      </div>
    </div>
  );
}

/** Card section on the insurance item: shows and edits the insured vehicle. */
export function InsuranceVehicleLinkPanel({ asset }: { asset: any }) {
  const cf = (asset?.custom_fields ?? {}) as Record<string, any>;
  const [emp, setEmp] = useState<string>(cf[INS_EMP_KEY] ?? "");
  const [plate, setPlate] = useState<string>(cf[INS_PLATE_KEY] ?? "");
  const update = useUpdateAsset();
  const { toast } = useToast();
  const { data: employees } = useEmployees();

  useEffect(() => {
    setEmp(cf[INS_EMP_KEY] ?? "");
    setPlate(cf[INS_PLATE_KEY] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, cf[INS_EMP_KEY], cf[INS_PLATE_KEY]]);

  const dirty = emp !== (cf[INS_EMP_KEY] ?? "") || plate !== (cf[INS_PLATE_KEY] ?? "");
  const empName = (employees ?? []).find((e: any) => e.id === cf[INS_EMP_KEY])?.full_name;

  const save = async () => {
    const next = { ...cf };
    if (emp) next[INS_EMP_KEY] = emp; else delete next[INS_EMP_KEY];
    if (plate) next[INS_PLATE_KEY] = plate; else delete next[INS_PLATE_KEY];
    try {
      await update.mutateAsync({ id: asset.id, custom_fields: next });
      toast({ title: "הרכב המבוטח נשמר" });
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3" dir="rtl">
      <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Car className="w-4 h-4" /> רכב מבוטח
      </h2>
      {cf[INS_PLATE_KEY] ? (
        <p className="text-sm">
          רכב <span className="font-medium tabular-nums">{cf[INS_PLATE_KEY]}</span>
          {empName && <> של {empName}</>}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">הביטוח עדיין לא שויך לרכב.</p>
      )}
      <InsuranceVehiclePicker employeeId={emp} plate={plate} onChange={(e, p) => { setEmp(e); setPlate(p); }} />
      {dirty && (
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          שמור שיוך
        </button>
      )}
    </div>
  );
}
