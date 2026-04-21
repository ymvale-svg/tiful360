import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface SubEmployer {
  id: string;
  company_id: string;
  legal_name: string;
  tax_id: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  withholding_file_number: string | null;
  contact_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useSubEmployers(activeOnly = false) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["sub_employers", activeCompanyId, activeOnly],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      let q = supabase
        .from("sub_employers" as any)
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("legal_name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SubEmployer[];
    },
    enabled: !!activeCompanyId,
  });
}

export function useCreateSubEmployer() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async (input: Omit<SubEmployer, "id" | "company_id" | "created_at" | "updated_at" | "is_active"> & { is_active?: boolean }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { data, error } = await supabase
        .from("sub_employers" as any)
        .insert({ ...input, company_id: activeCompanyId } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub_employers"] }),
  });
}

export function useUpdateSubEmployer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<SubEmployer> & { id: string }) => {
      const { data, error } = await supabase
        .from("sub_employers" as any)
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sub_employers"] }),
  });
}

export function useDeleteSubEmployer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Check no employees linked
      const { count, error: countErr } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("sub_employer_id" as any, id);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error(`לא ניתן למחוק — ${count} עובדים משויכים לתת-חברה זו. שייך אותם מחדש קודם.`);
      }
      const { error } = await supabase.from("sub_employers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sub_employers"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useSubEmployerEmployeeCounts() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["sub_employers_counts", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("employees")
        .select("sub_employer_id")
        .eq("company_id", activeCompanyId)
        .not("sub_employer_id" as any, "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((e: any) => {
        if (e.sub_employer_id) counts[e.sub_employer_id] = (counts[e.sub_employer_id] ?? 0) + 1;
      });
      return counts;
    },
    enabled: !!activeCompanyId,
  });
}
