import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface Payslip {
  id: string;
  company_id: string;
  employee_id: string | null;
  id_number_detected: string | null;
  employee_name_detected: string | null;
  period_year: number;
  period_month: number;
  pdf_url: string | null;
  vacation_balance: number | null;
  sick_balance: number | null;
  gross_salary: number | null;
  net_salary: number | null;
  work_days: number | null;
  work_hours: number | null;
  extraction_status: string;
  batch_id: string | null;
  created_at: string;
}

export function useEmployeePayslips(employeeId: string | undefined) {
  return useQuery({
    queryKey: ["payslips", "employee", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data as Payslip[];
    },
  });
}

export function usePayslipBatches() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["payslip-batches", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslip_batches")
        .select("*")
        .eq("company_id", activeCompanyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useUnmatchedPayslips(batchId: string | undefined) {
  return useQuery({
    queryKey: ["payslips", "unmatched", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*")
        .eq("batch_id", batchId!)
        .eq("extraction_status", "unmatched");
      if (error) throw error;
      return data as Payslip[];
    },
  });
}

export function useAssignPayslipToEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ payslipId, employeeId }: { payslipId: string; employeeId: string }) => {
      const { error } = await supabase
        .from("payslips")
        .update({ employee_id: employeeId, extraction_status: "success" })
        .eq("id", payslipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["payslip-batches"] });
    },
  });
}

export async function getPayslipSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("payslips").createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}
