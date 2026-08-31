import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export const SUBSCRIPTION_PROVIDERS = [
  "כביש 6",
  "נתיבי איילון",
  "פנגו",
  "סלופארק",
  "מנהרות הכרמל",
  "אחר",
] as const;

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  suspended: "מושהה",
  cancelled: "בוטל",
};

/** Vehicle ownership type — derived, never entered manually. */
export const VEHICLE_TYPE_LABELS = {
  private: "פרטי",
  company_rental: "חברה - השכרה",
  company_leasing: "חברה - ליסינג",
  company_owned: "חברה - בעלות",
} as const;

export type VehicleTypeKey = keyof typeof VEHICLE_TYPE_LABELS;

/** Maps an asset sub-category (asset_groups.name) to the company ownership type. */
export function vehicleTypeFromGroupName(groupName?: string | null): VehicleTypeKey {
  const n = (groupName ?? "").trim();
  if (n.includes("השכר")) return "company_rental";
  if (n.includes("ליסינג")) return "company_leasing";
  return "company_owned";
}

/** Resolves the real license plate for a vehicle asset: dedicated column first,
 *  then common custom-field keys, and only then the internal asset code. */
export function resolveVehiclePlate(asset: {
  license_plate?: string | null;
  asset_code?: string | null;
  custom_fields?: Record<string, any> | null;
}): string {
  if (asset.license_plate) return asset.license_plate;
  const cf = asset.custom_fields ?? {};
  for (const k of ["מס׳ רישוי", "מס' רישוי", "מספר רישוי", "license_plate"]) {
    const v = cf[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return asset.asset_code ?? "";
}

export type EmployeeVehicle = {
  id: string;
  company_id: string;
  employee_id: string;
  license_plate: string;
  notes: string | null;
  created_at: string;
};

export type VehicleSubscription = {
  id: string;
  company_id: string;
  employee_vehicle_id: string | null;
  asset_id: string | null;
  provider: string;
  start_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export function useEmployeeVehicles(employeeId?: string) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["employee-vehicles", activeCompanyId, employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("employee_vehicles").select("*").order("created_at");
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as EmployeeVehicle[];
    },
  });
}

export function useVehicleSubscriptions() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["vehicle-subscriptions", activeCompanyId],
    queryFn: async () => {
      let q = supabase.from("vehicle_subscriptions").select("*").order("start_date", { ascending: false });
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as VehicleSubscription[];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["employee-vehicles"] });
  qc.invalidateQueries({ queryKey: ["vehicle-subscriptions"] });
}

export function useSaveEmployeeVehicle() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: { id?: string; employee_id: string; license_plate: string; notes?: string | null }) => {
      const { id, ...rest } = params;
      if (id) {
        const { error } = await supabase
          .from("employee_vehicles")
          .update({ license_plate: rest.license_plate, notes: rest.notes ?? null })
          .eq("id", id);
        if (error) throw error;
        return;
      }
      if (!activeCompanyId) throw new Error("לא נבחרה חברה פעילה");
      const { error } = await supabase
        .from("employee_vehicles")
        .insert({ ...rest, notes: rest.notes ?? null, company_id: activeCompanyId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteEmployeeVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useSaveVehicleSubscription() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      id?: string;
      employee_vehicle_id?: string | null;
      asset_id?: string | null;
      provider: string;
      start_date?: string | null;
      status: string;
      notes?: string | null;
    }) => {
      const { id, ...rest } = params;
      const payload = {
        employee_vehicle_id: rest.employee_vehicle_id ?? null,
        asset_id: rest.asset_id ?? null,
        provider: rest.provider,
        start_date: rest.start_date || null,
        status: rest.status,
        notes: rest.notes ?? null,
      };
      if (id) {
        const { error } = await supabase.from("vehicle_subscriptions").update(payload).eq("id", id);
        if (error) throw error;
        return;
      }
      if (!activeCompanyId) throw new Error("לא נבחרה חברה פעילה");
      const { error } = await supabase
        .from("vehicle_subscriptions")
        .insert({ ...payload, company_id: activeCompanyId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteVehicleSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(qc),
  });
}
