import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

const SELECT = `*,
  employee:employees!attendance_corrections_employee_id_fkey(id, full_name, employee_code, department, role, email),
  manager:employees!attendance_corrections_manager_id_fkey(id, full_name, email)
`;

export type AttendanceCorrectionStatus = "pending" | "approved" | "rejected" | "cancelled";

/** All corrections in the active company (admin / manager / payroll see what RLS allows) */
export function useCompanyAttendanceCorrections() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["attendance-corrections", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("attendance_corrections")
        .select(SELECT)
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });
}

/** Corrections of the logged-in employee */
export function useMyAttendanceCorrections(employeeId?: string) {
  return useQuery({
    queryKey: ["my-attendance-corrections", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("attendance_corrections")
        .select(SELECT)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
  });
}

interface CreateInput {
  employee_id: string;
  manager_id?: string | null;
  correction_date: string;
  original_check_in?: string | null;
  original_check_out?: string | null;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  reason?: string;
  initiated_by: "employee" | "manager";
  attendance_record_id?: string | null;
}

export function useCreateAttendanceCorrection() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();

  return useMutation({
    mutationFn: async (input: CreateInput) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");

      const { data, error } = await supabase
        .from("attendance_corrections")
        .insert({
          company_id: activeCompanyId,
          employee_id: input.employee_id,
          manager_id: input.manager_id ?? null,
          correction_date: input.correction_date,
          original_check_in: input.original_check_in ?? null,
          original_check_out: input.original_check_out ?? null,
          requested_check_in: input.requested_check_in ?? null,
          requested_check_out: input.requested_check_out ?? null,
          reason: input.reason ?? null,
          initiated_by: input.initiated_by,
          attendance_record_id: input.attendance_record_id ?? null,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
      qc.invalidateQueries({ queryKey: ["my-attendance-corrections"] });
    },
  });
}

interface ReviewInput {
  correction_id: string;
  approve: boolean;
  manager_note?: string;
}

export function useReviewAttendanceCorrection() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ correction_id, approve, manager_note }: ReviewInput) => {
      const { error } = await supabase
        .from("attendance_corrections")
        .update({
          status: approve ? "approved" : "rejected",
          manager_note: manager_note ?? null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", correction_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
      qc.invalidateQueries({ queryKey: ["my-attendance-corrections"] });
    },
  });
}

export function useCancelAttendanceCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (correction_id: string) => {
      const { error } = await supabase
        .from("attendance_corrections")
        .update({ status: "cancelled" })
        .eq("id", correction_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-corrections"] });
      qc.invalidateQueries({ queryKey: ["my-attendance-corrections"] });
    },
  });
}
