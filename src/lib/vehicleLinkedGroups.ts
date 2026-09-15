// Helpers for sub-categories that belong to the "vehicle" section —
// e.g. subscription services such as Pango, toll roads and fuel cards.
// Such a subscription is always tied to a specific vehicle of the employee.

export type VehicleLinkedGroupLike = {
  id: string;
  name: string;
  is_vehicle_related?: boolean | null;
} | null | undefined;

export function isVehicleLinkedGroup(group: VehicleLinkedGroupLike): boolean {
  return !!group?.is_vehicle_related;
}

export function isVehicleAsset(asset: any): boolean {
  return asset?.asset_categories?.protocol_type === "vehicle" || !!asset?.license_plate;
}

/** All vehicles currently assigned to the given employee. */
export function findEmployeeVehicles(assets: any[] | undefined | null, employeeId?: string | null): any[] {
  if (!employeeId) return [];
  return (assets ?? []).filter((a: any) => a.current_owner_id === employeeId && isVehicleAsset(a));
}

export function vehicleLabel(vehicle: any): string {
  const plate = vehicle?.license_plate ? ` (${vehicle.license_plate})` : "";
  return `${vehicle?.manufacturer_model || vehicle?.asset_name || "רכב"}${plate}`;
}

export type LinkedVehicle = {
  id: string;
  source: "asset" | "personal";
  license_plate: string;
  asset_code?: string | null;
  manufacturer_model?: string | null;
  asset_name?: string | null;
};

/** Normalizes inventory vehicle assets + the employee's personal vehicles into one list. */
export function collectEmployeeVehicles(
  assets: any[] | undefined | null,
  personalVehicles: any[] | undefined | null,
  employeeId?: string | null,
): LinkedVehicle[] {
  if (!employeeId) return [];
  const fromAssets: LinkedVehicle[] = findEmployeeVehicles(assets, employeeId).map((a: any) => ({
    id: a.id,
    source: "asset",
    license_plate: a.license_plate ?? "",
    asset_code: a.asset_code ?? null,
    manufacturer_model: a.manufacturer_model ?? null,
    asset_name: a.asset_name ?? null,
  }));
  const plates = new Set(fromAssets.map((v) => (v.license_plate || "").trim()).filter(Boolean));
  const fromPersonal: LinkedVehicle[] = (personalVehicles ?? [])
    .filter((v: any) => v.employee_id === employeeId && !plates.has((v.license_plate ?? "").trim()))
    .map((v: any) => ({
      id: v.id,
      source: "personal",
      license_plate: v.license_plate ?? "",
      asset_code: null,
      manufacturer_model: null,
      asset_name: v.notes || null,
    }));
  return [...fromAssets, ...fromPersonal];
}

/** Extracts a license plate written in a subscription's notes, e.g. "רכב- 59935503". */
export function plateFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/רכב\s*[-:]\s*([\w\d\-]+)/);
  return m ? m[1].trim() : null;
}
