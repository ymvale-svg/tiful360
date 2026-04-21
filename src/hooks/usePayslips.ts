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
  source_pdf_url?: string | null;
  page_indices?: number[] | null;
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

export function useDeletePayslip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payslipId: string) => {
      // Try to remove the split PDF from storage (best effort)
      const { data: row } = await supabase
        .from("payslips")
        .select("pdf_url, source_pdf_url")
        .eq("id", payslipId)
        .maybeSingle();
      if (row?.pdf_url && row.pdf_url !== row.source_pdf_url) {
        await supabase.storage.from("payslips").remove([row.pdf_url]);
      }
      const { error } = await supabase.from("payslips").delete().eq("id", payslipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["payslip-batches"] });
      qc.invalidateQueries({ queryKey: ["batch-payslips"] });
    },
  });
}

export function useBatchPayslips(batchId: string | undefined) {
  return useQuery({
    queryKey: ["batch-payslips", batchId],
    enabled: !!batchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payslips")
        .select("*, employee:employees!payslips_employee_id_fkey(full_name, id_number)")
        .eq("batch_id", batchId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      // Fetch all payslips for the batch to remove their split PDFs
      const { data: rows } = await supabase
        .from("payslips")
        .select("pdf_url, source_pdf_url")
        .eq("batch_id", batchId);
      const paths = (rows ?? [])
        .filter((r: any) => r.pdf_url && r.pdf_url !== r.source_pdf_url)
        .map((r: any) => r.pdf_url as string);
      if (paths.length > 0) {
        await supabase.storage.from("payslips").remove(paths);
      }
      // Delete payslips, then batch
      const { error: e1 } = await supabase.from("payslips").delete().eq("batch_id", batchId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("payslip_batches").delete().eq("id", batchId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payslips"] });
      qc.invalidateQueries({ queryKey: ["payslip-batches"] });
      qc.invalidateQueries({ queryKey: ["payroll-batches-recent"] });
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

export async function getPayslipSignedUrl(
  path: string,
  pageIndices?: number[] | null,
  isSourceFallback = false
): Promise<string | null> {
  const { data, error } = await supabase.storage.from("payslips").createSignedUrl(path, 300);
  if (error) return null;
  let url = data.signedUrl;
  // Only add #page=N when opening the shared source PDF (fallback).
  // The per-employee split PDF starts at page 1 by definition.
  if (isSourceFallback && pageIndices && pageIndices.length > 0) {
    const firstPage = Math.min(...pageIndices) + 1;
    url += `#page=${firstPage}`;
  }
  return url;
}
