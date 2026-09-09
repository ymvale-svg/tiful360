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
