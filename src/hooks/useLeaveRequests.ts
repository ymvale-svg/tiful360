import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { generateAndUploadLeavePdf } from "@/lib/generateLeaveRequestPdf";

export type LeaveRequestType = "vacation" | "sick" | "personal" | "other";
export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

const SELECT = `*,
  employee:employees!leave_requests_employee_id_fkey(id, full_name, employee_code, department, role, email, id_number),
  manager:employees!leave_requests_manager_id_fkey(id, full_name, email)
`;

/** My (employee) own requests */
export function useMyLeaveRequests(employeeId?: string) {
  return useQuery({
    queryKey: ["my-leave-requests", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select(SELECT)
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
  });
}

/** Requests visible to current user as manager / admin (whole company) */
export function useTeamLeaveRequests() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["team-leave-requests", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase
        .from("leave_requests")
        .select(SELECT)
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCompanyId,
  });
}

/** Requests for a single employee (used in EmployeeDetail tab) */
export function useEmployeeLeaveRequests(employeeId?: string) {
  return useQuery({
    queryKey: ["employee-leave-requests", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("leave_requests")
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
  manager_id: string | null;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  total_days: number;
  reason?: string;
  attachment_file?: File | null;
}

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();

  return useMutation({
    mutationFn: async (input: CreateInput) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");

      // Upload attachment first (if provided)
      let attachment_url: string | null = null;
      if (input.attachment_file) {
        const ext = input.attachment_file.name.split(".").pop() || "bin";
        const path = `${input.employee_id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("leave-attachments")
          .upload(path, input.attachment_file, { upsert: false });
        if (upErr) throw upErr;
        const { data } = await supabase.storage
          .from("leave-attachments")
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        attachment_url = data?.signedUrl ?? path;
      }

      const { data: inserted, error } = await supabase
        .from("leave_requests")
        .insert({
          company_id: activeCompanyId,
          employee_id: input.employee_id,
          manager_id: input.manager_id,
          request_type: input.request_type,
          start_date: input.start_date,
          end_date: input.end_date,
          total_days: input.total_days,
          reason: input.reason || null,
          attachment_url,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw error;

      // Fire emails (non-blocking on error)
      try {
        await supabase.functions.invoke("send-leave-request-email", {
          body: { request_id: inserted.id, event: "submitted" },
        });
      } catch (e) {
        console.warn("send-leave-request-email failed", e);
      }

      // Sick leaves auto-approve and notify payroll directly
      if (input.request_type === "sick") {
        try {
          await supabase.functions.invoke("notify-payroll-sick-leave", {
            body: { request_id: inserted.id },
          });
        } catch (e) {
          console.warn("notify-payroll-sick-leave failed", e);
        }
      }

      return inserted;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["team-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["employee-leave-requests"] });
    },
  });
}

interface ReviewInput {
  request_id: string;
  approve: boolean;
  manager_note?: string;
}

export function useReviewLeaveRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCompany } = useCompany();

  return useMutation({
    mutationFn: async ({ request_id, approve, manager_note }: ReviewInput) => {
      const new_status: LeaveRequestStatus = approve ? "approved" : "rejected";

      // Load full request with employee + manager for PDF generation
      const { data: full, error: loadErr } = await supabase
        .from("leave_requests")
        .select(SELECT)
        .eq("id", request_id)
        .single();
      if (loadErr) throw loadErr;

      let signed_pdf_url: string | null = null;
      if (approve) {
        try {
          signed_pdf_url = await generateAndUploadLeavePdf(
            {
              request: {
                id: full.id,
                request_type: full.request_type,
                start_date: full.start_date,
                end_date: full.end_date,
                total_days: full.total_days,
                reason: full.reason,
                reviewed_at: new Date().toISOString(),
                manager_note: manager_note ?? null,
              },
              employee: full.employee,
              manager: full.manager,
              company: { name: activeCompany?.name ?? "" },
            },
            full.employee_id,
          );
        } catch (e) {
          console.warn("PDF generation failed", e);
        }
      }

      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: new_status,
          manager_note: manager_note ?? null,
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
          signed_pdf_url,
        })
        .eq("id", request_id);
      if (error) throw error;

      try {
        await supabase.functions.invoke("send-leave-request-email", {
          body: { request_id, event: approve ? "approved" : "rejected" },
        });
      } catch (e) {
        console.warn("send-leave-request-email failed", e);
      }

      return { request_id, new_status };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["employee-leave-requests"] });
    },
  });
}

export function useCancelLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (request_id: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "cancelled" })
        .eq("id", request_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["team-leave-requests"] });
      qc.invalidateQueries({ queryKey: ["employee-leave-requests"] });
    },
  });
}
