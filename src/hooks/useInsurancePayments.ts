import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InsurancePayment {
  id: string;
  asset_id: string;
  company_id: string;
  due_date: string;
  amount: number | null;
  note: string | null;
  paid_at: string | null;
  paid_by: string | null;
}

const db = supabase as any;

export function useInsurancePayments(assetId?: string) {
  return useQuery({
    queryKey: ["insurance-payments", assetId],
    enabled: !!assetId,
    queryFn: async () => {
      const { data, error } = await db.from("insurance_payments").select("*").eq("asset_id", assetId).order("due_date");
      if (error) throw error;
      return (data ?? []) as InsurancePayment[];
    },
  });
}

/** Next unpaid payment per asset for a company (for tables). */
export function useNextInsurancePayments(companyId?: string | null) {
  return useQuery({
    queryKey: ["insurance-payments-next", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await db.from("insurance_payments").select("asset_id,due_date,amount")
        .eq("company_id", companyId).is("paid_at", null).order("due_date");
      if (error) throw error;
      const m = new Map<string, { due_date: string; amount: number | null }>();
      for (const r of data ?? []) if (!m.has(r.asset_id)) m.set(r.asset_id, r);
      return m;
    },
  });
}

export function nextUnpaid(list: InsurancePayment[] | undefined) {
  return (list ?? []).find((p) => !p.paid_at) ?? null;
}

/** Build installment dates: count payments starting at first, every `monthsStep` months. */
export function buildInstallmentDates(first: string, count: number, monthsStep: number): string[] {
  const [y, m, d] = first.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = m - 1 + i * monthsStep;
    const yy = y + Math.floor(total / 12);
    const mm = total % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    out.push(`${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`);
  }
  return out;
}

export function useInsurancePaymentMutations(assetId: string) {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["insurance-payments", assetId] });
    qc.invalidateQueries({ queryKey: ["insurance-payments-next"] });
  };
  const add = useMutation({
    mutationFn: async (rows: Partial<InsurancePayment>[]) => {
      const { error } = await db.from("insurance_payments").insert(rows);
      if (error) throw error;
    },
    onSuccess: inv,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<InsurancePayment> & { id: string }) => {
      const { error } = await db.from("insurance_payments").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: inv,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("insurance_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: inv,
  });
  const setPaid = useMutation({
    mutationFn: async ({ p, paid }: { p: InsurancePayment; paid: boolean }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db.from("insurance_payments")
        .update({ paid_at: paid ? new Date().toISOString() : null, paid_by: paid ? u.user?.id : null }).eq("id", p.id);
      if (error) throw error;
      await db.from("activity_log").insert({
        company_id: p.company_id, entity_type: "asset", entity_id: p.asset_id, user_id: u.user?.id,
        action: paid ? "insurance_payment_paid" : "insurance_payment_unpaid",
        details: { payment_id: p.id, due_date: p.due_date, amount: p.amount },
      });
    },
    onSuccess: inv,
  });
  return { add, update, remove, setPaid };
}
