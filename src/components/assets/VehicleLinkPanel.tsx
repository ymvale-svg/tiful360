import { Car, AlertTriangle } from "lucide-react";
import { useAssets } from "@/hooks/useData";
import { useEmployeeVehicles } from "@/hooks/useVehicleSubscriptions";
import { collectEmployeeVehicles, plateFromNotes, type LinkedVehicle } from "@/lib/vehicleLinkedGroups";

interface Props {
  asset: any;
  /** Optional click handler for navigating to the vehicle card */
  onOpenVehicle?: (vehicleId: string) => void;
}

function label(v: LinkedVehicle): string {
  const name = v.manufacturer_model || (v.source === "asset" ? v.asset_name : null) || "רכב";
  return v.license_plate ? `${name} (${v.license_plate})` : name;
}

/**
 * Shown on subscription items that belong to the vehicle section
 * (Pango, toll roads, fuel cards). Resolves the vehicle the subscription
 * belongs to — from inventory vehicles or the employee's personal vehicles.
 */
export function VehicleLinkPanel({ asset, onOpenVehicle }: Props) {
  const { data: assets } = useAssets();
  const ownerId = asset?.current_owner_id as string | null;
  const { data: personal } = useEmployeeVehicles(ownerId ?? undefined);
  const vehicles = collectEmployeeVehicles(assets, personal, ownerId);

  const notedPlate = plateFromNotes(asset?.notes);
  const matched = notedPlate
    ? vehicles.find((v) => (v.license_plate || "").trim() === notedPlate)
    : undefined;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-3" dir="rtl">
      <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <Car className="w-4 h-4" />
        רכב משויך למנוי
      </h2>

      {!ownerId ? (
        <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>המנוי אינו משויך לעובד, ולכן לא ניתן לזהות את הרכב. יש לבצע שיוך לעובד בעל רכב.</span>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex items-start gap-2 text-sm rounded-lg border border-destructive/40 bg-destructive/10 text-destructive p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>לא נמצא רכב המשויך לעובד — לא ניתן לקשר את המנוי לרכב. יש לשייך רכב לעובד תחילה.</span>
        </div>
      ) : (
        <ul className="space-y-2">
          {vehicles.map((v) => {
            const isMatched = matched?.id === v.id;
            const clickable = v.source === "asset" && !!onOpenVehicle;
            return (
              <li key={`${v.source}-${v.id}`}>
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onOpenVehicle?.(v.id)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                    isMatched ? "bg-primary/10 border border-primary/40" : "bg-muted/60"
                  } ${clickable ? "hover:bg-muted" : "cursor-default"}`}
                >
                  <Car className="w-4 h-4 text-primary" />
                  <span className="font-medium">{label(v)}</span>
                  {isMatched && <span className="text-xs text-primary">מקושר למנוי</span>}
                  <span className="text-xs text-muted-foreground mr-auto">
                    {v.source === "personal" ? "רכב פרטי של העובד" : v.asset_code}
                  </span>
                </button>
              </li>
            );
          })}
          {notedPlate && !matched && (
            <li className="text-xs text-destructive">
              במנוי רשום רכב {notedPlate}, אך הוא אינו מופיע ברכבי העובד.
            </li>
          )}
          {!notedPlate && vehicles.length > 1 && (
            <li className="text-xs text-muted-foreground">
              לעובד יותר מרכב אחד — יש לוודא לאיזה רכב מיועד המנוי.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
