import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  DEFAULT_TAX101_SETTINGS,
  type Tax101DependentSource,
  type Tax101EmployeeSource,
  type Tax101Settings,
} from "@/lib/tax101/prefill";
import { TAX101_TEMPLATE_VERSION, type Tax101FormData } from "@/lib/tax101/types";

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

export interface Tax101ContextResult {
  form: {
    id: string;
    tax_year: number;
    status: Tax101Status;
    form_data: unknown;
    pdf_url: string | null;
    signed_at: string | null;
    company_id: string;
    template_version: string | null;
  };
  company: { name: string | null; logo_url: string | null };
  employer: { name: string; address: string; phone: string; tax_file_number: string };
  settings: Pick<Tax101Settings, "default_income_type" | "allow_edit_prefilled" | "write_back_to_employee">;
  employee: Tax101EmployeeSource & { id: string; company_id: string | null; employee_code?: string | null };
  dependents: Tax101DependentSource[];
}

/** Everything the official-form auto-fill needs, for the signed-in employee or a token link. */
export function useTax101Context(target: { formId?: string | null; token?: string | null }) {
  const { formId, token } = target;
  return useQuery({
    queryKey: ["tax101", "context", formId ?? null, token ?? null],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tax_form_101_context", {
        _form_id: formId ?? null,
        _token: token ?? null,
      });
      if (error) throw error;
      return (data ?? null) as unknown as Tax101ContextResult | null;
    },
    enabled: !!(formId || token),
    staleTime: 0,
  });
}

// Sign the form: one atomic DB call (status, PDF, write-back to the employee card, activity log)
export function useSubmitTax101() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      formId,
      token,
      formData,
      signatureData,
      pdfPath,
    }: {
      formId: string;
      token?: string | null;
      formData: Tax101FormData;
      signatureData: string;
      pdfPath: string;
    }) => {
      const { data, error } = await supabase.rpc("submit_tax_form_101", {
        _form_id: formId,
        _token: token ?? null,
        _form_data: formData as unknown as Json,
        _signature: signatureData,
        _pdf_url: pdfPath,
        _template_version: TAX101_TEMPLATE_VERSION,
      });
      if (error) throw error;

      // E-mail the signed PDF to payroll. The form is already signed, so a mail
      // failure must not be reported as a failed signature.
      try {
        await supabase.functions.invoke("send-tax101-email", {
          body: token ? { form_id: formId, access_token: token } : { form_id: formId },
        });
      } catch (e) {
        console.warn("send-tax101-email failed:", e);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tax101"] });
      qc.invalidateQueries({ queryKey: ["activity-log"] });
    },
  });
}

export function useTax101Settings(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ["tax101", "settings", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax101_settings")
        .select("*")
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_TAX101_SETTINGS, ...(data ?? {}) } as Tax101Settings;
    },
    enabled: !!companyId,
  });
}

export function useSaveTax101Settings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ companyId, settings }: { companyId: string; settings: Tax101Settings }) => {
      const { error } = await supabase
        .from("tax101_settings")
        .upsert({ company_id: companyId, ...settings, updated_by: user?.id ?? null }, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["tax101", "settings", v.companyId] }),
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
