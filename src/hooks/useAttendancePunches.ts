import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface AttendancePunch {
  id: string;
  company_id: string;
  employee_id: string | null;
  employee_code_raw: string;
  punch_at: string;
  direction: "in" | "out" | "unknown";
  source: string;
  status: "pending" | "approved" | "rejected" | "paid";
  raw_payload: any;
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
}

/** פאנצ'ים לעובד מסוים בחודש מסוים */
export function useEmployeePunches(employeeId: string | null, year: number, month: number) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["attendance_punches", "employee", activeCompanyId, employeeId, year, month],
    queryFn: async () => {
      if (!activeCompanyId || !employeeId) return [];
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("*")
        .eq("company_id", activeCompanyId)
        .eq("employee_id", employeeId)
        .gte("punch_at", start)
        .lt("punch_at", end)
        .order("punch_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AttendancePunch[];
    },
    enabled: !!activeCompanyId && !!employeeId,
  });
}

/** פאנצ'ים יתומים — לא משויכים לעובד */
export function useOrphanPunches() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["attendance_punches", "orphans", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("*")
        .eq("company_id", activeCompanyId)
        .is("employee_id", null)
        .order("punch_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AttendancePunch[];
    },
    enabled: !!activeCompanyId,
  });
}

/** סטטיסטיקות חודשיות לכלל החברה */
export function useMonthlyPunchStats(year: number, month: number) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["attendance_punches", "stats", activeCompanyId, year, month],
    queryFn: async () => {
      if (!activeCompanyId) return { total: 0, pending: 0, approved: 0, paid: 0, lastAt: null as string | null };
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 1).toISOString();
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("status, punch_at")
        .eq("company_id", activeCompanyId)
        .gte("punch_at", start)
        .lt("punch_at", end);
      if (error) throw error;
      const arr = data ?? [];
      const lastAt = arr.length ? arr.reduce((a, b) => (a.punch_at > b.punch_at ? a : b)).punch_at : null;
      return {
        total: arr.length,
        pending: arr.filter((r: any) => r.status === "pending").length,
        approved: arr.filter((r: any) => r.status === "approved").length,
        paid: arr.filter((r: any) => r.status === "paid").length,
        lastAt,
      };
    },
    enabled: !!activeCompanyId,
  });
}

/** עדכון סטטוס פאנצ'ים */
export function useUpdatePunchStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: AttendancePunch["status"] }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("attendance_punches")
        .update({ status, processed_at: new Date().toISOString(), processed_by: user?.id ?? null })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}

/** שיוך פאנץ' יתום לעובד */
export function useAssignPunchEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ punchId, employeeId }: { punchId: string; employeeId: string }) => {
      const { error } = await supabase
        .from("attendance_punches")
        .update({ employee_id: employeeId })
        .eq("id", punchId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}

/** עדכון כיוון/זמן של פאנץ' */
export function useUpdatePunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Pick<AttendancePunch, "direction" | "punch_at">> }) => {
      const { error } = await supabase.from("attendance_punches").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}
