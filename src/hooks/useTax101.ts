import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";

export type Tax101Status = "pending" | "signed" | "sent";

export interface Tax101Form {
  id: string;
  employee_id: string;
  company_id: string;
  tax_year: number;
  status: Tax101Status;
  form_data: any;
  signature_data: string | null;
  pdf_url: string | null;
  created_by: string | null;
  created_at: string;
  signed_at: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  access_token: string | null;
  token_expires_at: string | null;
  employee?: {
    full_name: string;
    employee_code: string;
    department: string;
    email: string | null;
  };
}

// List forms in the active company (for payroll/admin)
export function useCompanyTax101Forms(year?: number) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["tax101", "company", activeCompanyId, year],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let q = supabase
        .from("tax_form_101" as any)
        .select("*, employee:employees!tax_form_101_employee_id_fkey(full_name, employee_code, department, email)")
        .eq("company_id", activeCompanyId)
        .order("created_at", { ascending: false });
      if (year) q = q.eq("tax_year", year);
      const { data, error } = await q;
      if (error) {
        // Fallback without join if FK not available in types
        const { data: d2, error: e2 } = await supabase
          .from("tax_form_101" as any)
          .select("*")
          .eq("company_id", activeCompanyId)
          .order("created_at", { ascending: false });
        if (e2) throw e2;
        return (d2 ?? []) as any[];
      }
      return (data ?? []) as any[];
    },
    enabled: !!activeCompanyId,
  });
}

// List MY forms (employee in portal)
export function useMyTax101Forms(employeeId: string | undefined | null) {
  return useQuery({
    queryKey: ["tax101", "mine", employeeId],
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .order("tax_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!employeeId,
  });
}

// Single pending form for an employee+year (banner)
export function useMyPendingTax101(employeeId: string | undefined | null, year: number) {
  return useQuery({
    queryKey: ["tax101", "pending", employeeId, year],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .eq("tax_year", year)
        .eq("status", "pending")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!employeeId,
  });
}

// Lookup form by access token (public flow)
export function useTax101ByToken(token: string | undefined) {
  return useQuery({
    queryKey: ["tax101", "token", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .select("*")
        .eq("access_token", token)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!token,
  });
}

// Create a batch of forms for selected employees
export function useCreateTax101Batch() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCompanyId } = useCompany();

  return useMutation({
    mutationFn: async ({
      employeeIds,
      taxYear,
      sendInvites,
    }: {
      employeeIds: string[];
      taxYear: number;
      sendInvites: boolean;
    }) => {
      if (!activeCompanyId) throw new Error("No active company");
      // Fetch employees to get their sub_employer_id
      const { data: emps, error: empErr } = await (supabase as any)
        .from("employees")
        .select("id, sub_employer_id")
        .in("id", employeeIds);
      if (empErr) throw empErr;
      const subMap = new Map<string, string | null>();
      (emps ?? []).forEach((e: any) => subMap.set(e.id, e.sub_employer_id ?? null));

      const rows = employeeIds.map((eid) => ({
        employee_id: eid,
        company_id: activeCompanyId,
        tax_year: taxYear,
        status: "pending",
        created_by: user?.id ?? null,
        sub_employer_id: subMap.get(eid) ?? null,
      }));
      // Upsert on conflict (employee_id, tax_year) — keep existing if any
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .upsert(rows, { onConflict: "employee_id,tax_year", ignoreDuplicates: true })
        .select("*");
      if (error) throw error;

      if (sendInvites && data) {
        await Promise.allSettled(
          (data as any[]).map((f) =>
            supabase.functions.invoke("send-tax101-invite", { body: { form_id: f.id } })
          )
        );
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax101"] });
    },
  });
}

// Save signed form (employee or token flow)
export function useSubmitTax101() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      formId,
      formData,
      signatureData,
      pdfUrl,
    }: {
      formId: string;
      formData: any;
      signatureData: string;
      pdfUrl: string;
    }) => {
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .update({
          form_data: formData,
          signature_data: signatureData,
          pdf_url: pdfUrl,
          status: "signed",
          signed_at: new Date().toISOString(),
        })
        .eq("id", formId)
        .select("*")
        .single();
      if (error) throw error;

      // Trigger email send (with attachment via Resend)
      await supabase.functions.invoke("send-tax101-email", { body: { form_id: formId } });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax101"] });
    },
  });
}

export function useSendTax101Invite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formId: string) => {
      const { data, error } = await supabase.functions.invoke("send-tax101-invite", {
        body: { form_id: formId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax101"] });
    },
  });
}

export function useDeleteTax101() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (formId: string) => {
      const { error } = await supabase.from("tax_form_101" as any).delete().eq("id", formId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax101"] }),
  });
}
