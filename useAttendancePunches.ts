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
  status: "pending" | "approved" | "rejected";
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
        .neq("status", "rejected")
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
      if (!activeCompanyId) return { total: 0, pending: 0, approved: 0, lastAt: null as string | null };
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

/** שיוך פאנץ' יתום לעובד + שיוך אוטומטי של כל היתומים עם אותו קוד + שמירת הקוד על העובד */
export function useAssignPunchEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ punchId, employeeId }: { punchId: string; employeeId: string }) => {
      // 1. Read the punch to get its raw employee code + company
      const { data: punch, error: readErr } = await supabase
        .from("attendance_punches")
        .select("id, company_id, employee_code_raw")
        .eq("id", punchId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!punch) throw new Error("הפעימה לא נמצאה");

      const code = (punch.employee_code_raw ?? "").trim();

      // 2. Update the employee record with this code (so future ingests auto-link)
      if (code) {
        const { data: emp } = await supabase
          .from("employees")
          .select("employee_code")
          .eq("id", employeeId)
          .maybeSingle();
        if (!emp?.employee_code || emp.employee_code !== code) {
          const { error: empErr } = await supabase
            .from("employees")
            .update({ employee_code: code })
            .eq("id", employeeId);
          if (empErr) throw empErr;
        }
      }

      // 3. Bulk-assign ALL orphan punches in the same company with the same raw code
      let updatedCount = 1;
      if (code) {
        const { data: bulkUpdated, error: bulkErr } = await supabase
          .from("attendance_punches")
          .update({ employee_id: employeeId })
          .eq("company_id", punch.company_id)
          .eq("employee_code_raw", code)
          .is("employee_id", null)
          .select("id");
        if (bulkErr) throw bulkErr;
        updatedCount = bulkUpdated?.length ?? 1;
      } else {
        // No code on the punch — assign just this one
        const { error: singleErr } = await supabase
          .from("attendance_punches")
          .update({ employee_id: employeeId })
          .eq("id", punchId);
        if (singleErr) throw singleErr;
      }

      return { count: updatedCount, code };
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

/** הוספת פעימה ידנית (תיקון מנהל) — נכתבת ישירות לנתוני הנוכחות של השעון */
export function useAddPunch() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (params: {
      employeeId: string;
      employeeCode: string;
      punchAt: string; // ISO
      direction: "in" | "out" | "unknown";
    }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה פעילה");
      const { error } = await supabase.from("attendance_punches").insert({
        company_id: activeCompanyId,
        employee_id: params.employeeId,
        employee_code_raw: params.employeeCode,
        punch_at: params.punchAt,
        direction: params.direction,
        source: "manual",
        status: "approved",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}

/** מחיקת פעימה מנתוני הנוכחות */
export function useDeletePunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_punches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}

/** הפעימות של העובד הנוכחי (פורטל) */
export function useMyPunches(employeeId: string | null | undefined, days = 30) {
  return useQuery({
    queryKey: ["attendance_punches", "mine", employeeId, days],
    queryFn: async () => {
      if (!employeeId) return [];
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await supabase
        .from("attendance_punches")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("punch_at", since)
        .order("punch_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendancePunch[];
    },
    enabled: !!employeeId,
  });
}

/** יצירת פעימה מרחוק עם חתימה */
export function useCreateRemotePunch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      companyId: string;
      employeeId: string;
      employeeCode: string;
      direction: "in" | "out";
      signatureDataUrl?: string;
      note?: string;
      geo?: { lat: number; lng: number; accuracy?: number } | null;
    }) => {
      const { error } = await supabase.from("attendance_punches").insert({
        company_id: params.companyId,
        employee_id: params.employeeId,
        employee_code_raw: params.employeeCode,
        punch_at: new Date().toISOString(),
        direction: params.direction,
        source: "portal_remote",
        status: "pending",
        raw_payload: {
          signature_data_url: params.signatureDataUrl ?? null,
          note: params.note ?? null,
          geo: params.geo ?? null,
          user_agent: navigator.userAgent,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance_punches"] }),
  });
}
