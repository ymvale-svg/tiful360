import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

export type OnboardingStatus = "draft" | "sent" | "in_progress" | "done";

export interface OnboardingItem {
  id: string;
  process_id: string;
  item_type: string;
  title: string;
  owner_role: string;
  catalog_ref_id: string | null;
  selected_group_id: string | null;
  fulfillment_type: string | null;
  asset_id: string | null;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OnboardingProcess {
  id: string;
  company_id: string;
  employee_id: string;
  status: OnboardingStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  pdf_url: string | null;
  employees?: {
    full_name: string;
    employee_code: string;
    role: string;
    department: string;
    start_date: string;
    email: string | null;
  } | null;
  onboarding_items?: OnboardingItem[];
}

export const ONBOARDING_STATUS_LABEL: Record<OnboardingStatus, string> = {
  draft: "טיוטה",
  sent: "נשלח לתפעול",
  in_progress: "בביצוע",
  done: "הושלם",
};

export function useOnboardingProcesses() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["onboarding-processes", activeCompanyId],
    queryFn: async () => {
      let q = supabase
        .from("onboarding_processes")
        .select(
          "*, employees(full_name, employee_code, role, department, start_date, email), onboarding_items(*)"
        )
        .order("created_at", { ascending: false });
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as OnboardingProcess[];
    },
  });
}

export interface NewOnboardingItem {
  title: string;
  owner_role?: string;
  item_type?: string;
  catalog_ref_id?: string | null;
  selected_group_id?: string | null;
  fulfillment_type?: string | null;
  notes?: string | null;
}

export function useCreateOnboardingProcess() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      employee_id,
      items,
      status = "draft",
    }: {
      employee_id: string;
      items: NewOnboardingItem[];
      status?: OnboardingStatus;
    }) => {
      const { data: proc, error } = await supabase
        .from("onboarding_processes")
        .insert({
          company_id: activeCompanyId,
          employee_id,
          status,
          created_by: user?.id ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (items.length) {
        const { error: itemsErr } = await supabase.from("onboarding_items").insert(
          items.map((i) => ({
            process_id: proc.id,
            title: i.title,
            item_type: i.item_type ?? "asset",
            owner_role: i.owner_role ?? "it_manager",
            catalog_ref_id: i.catalog_ref_id ?? null,
            selected_group_id: i.selected_group_id ?? null,
            fulfillment_type: i.fulfillment_type ?? null,
            notes: i.notes ?? null,
          })) as any
        );
        if (itemsErr) throw itemsErr;
      }
      return proc as unknown as OnboardingProcess;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useUpdateOnboardingProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; status?: OnboardingStatus; completed_at?: string | null }) => {
      const { error } = await supabase.from("onboarding_processes").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

export function useDeleteOnboardingProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("onboarding_processes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-processes"] }),
  });
}

export function useUpsertOnboardingItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      process_id,
      ...patch
    }: Partial<OnboardingItem> & { id?: string; process_id?: string }) => {
      const payload: any = { ...patch };
      if (patch.status === "done") {
        payload.completed_at = new Date().toISOString();
        payload.completed_by = user?.id ?? null;
      }
      if (id) {
        const { error } = await supabase.from("onboarding_items").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("onboarding_items")
          .insert({ ...payload, process_id } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-processes"] }),
  });
}

export function useDeleteOnboardingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("onboarding_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding-processes"] }),
  });
}

/** Role/department default item templates. */
export interface RoleTemplate {
  id: string;
  company_id: string;
  role_name: string;
  department: string | null;
  default_items: NewOnboardingItem[];
}

export function useRoleTemplates() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["role-templates", activeCompanyId],
    queryFn: async () => {
      let q = supabase.from("role_templates").select("*").order("role_name");
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as RoleTemplate[];
    },
  });
}

export function useSaveRoleTemplate() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      role_name,
      department,
      default_items,
    }: {
      id?: string;
      role_name: string;
      department?: string | null;
      default_items: NewOnboardingItem[];
    }) => {
      if (id) {
        const { error } = await supabase
          .from("role_templates")
          .update({ role_name, department: department ?? null, default_items } as any)
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("role_templates").insert({
          company_id: activeCompanyId,
          role_name,
          department: department ?? null,
          default_items,
          created_by: user?.id ?? null,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["role-templates"] }),
  });
}

/** Days until the employee's start date (negative = already started). */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
