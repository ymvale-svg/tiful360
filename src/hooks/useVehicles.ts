import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  addTierRole,
  createVehicleRequest,
  deleteQuote,
  draftQuoteRequest,
  extractQuote,
  getVehicleRequestForItem,
  listSuppliers,
  listTiers,
  listVehicleRequests,
  removeTierRole,
  saveQuote,
  saveSupplier,
  saveTier,
  sendQuoteRequest,
  updateVehicleRequest,
  uploadQuoteFile,
} from "@/services/vehicles";
import type { Supplier, VehicleQuote, VehicleRequest, VehicleTier } from "@/domain/vehicles/types";

const KEY = ["vehicles"] as const;

function useCompanyId() {
  const { activeCompanyId } = useCompany();
  return activeCompanyId;
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useSuppliers() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: [...KEY, "suppliers", companyId], queryFn: () => listSuppliers(supabase, companyId!), enabled: !!companyId });
}

export function useSaveSupplier() {
  const companyId = useCompanyId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (s: Partial<Supplier> & Pick<Supplier, "name">) => saveSupplier(supabase, companyId!, s),
    onSuccess: invalidate,
  });
}

export function useVehicleTiers() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: [...KEY, "tiers", companyId], queryFn: () => listTiers(supabase, companyId!), enabled: !!companyId });
}

export function useSaveTier() {
  const companyId = useCompanyId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (t: Partial<VehicleTier> & Pick<VehicleTier, "name">) => saveTier(supabase, companyId!, t),
    onSuccess: invalidate,
  });
}

export function useTierRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (op: { add: { tierId: string; roleName: string; department?: string | null } } | { removeId: string }) =>
      "add" in op ? addTierRole(supabase, op.add.tierId, op.add.roleName, op.add.department) : removeTierRole(supabase, op.removeId),
    onSuccess: invalidate,
  });
}

export function useVehicleRequests() {
  const companyId = useCompanyId();
  return useQuery({ queryKey: [...KEY, "requests", companyId], queryFn: () => listVehicleRequests(supabase, companyId!), enabled: !!companyId });
}

/** The car request of an onboarding item, if one was opened. */
export function useItemVehicleRequest(onboardingItemId: string | null) {
  return useQuery({
    queryKey: [...KEY, "requests", "item", onboardingItemId],
    queryFn: () => getVehicleRequestForItem(supabase, onboardingItemId!),
    enabled: !!onboardingItemId,
  });
}

export function useCreateVehicleRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (r: Parameters<typeof createVehicleRequest>[1]) => createVehicleRequest(supabase, r),
    onSuccess: invalidate,
  });
}

export function useUpdateVehicleRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<VehicleRequest> }) => updateVehicleRequest(supabase, id, patch),
    onSuccess: invalidate,
  });
}

export function useSaveQuote() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (q: Partial<VehicleQuote> & Pick<VehicleQuote, "request_id">) => saveQuote(supabase, q),
    onSuccess: invalidate,
  });
}

export function useDeleteQuote() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => deleteQuote(supabase, id), onSuccess: invalidate });
}

export function useDraftQuoteRequest() {
  return useMutation({ mutationFn: (requestId: string) => draftQuoteRequest(supabase, requestId) });
}

export function useSendQuoteRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ requestId, supplierIds, subject, body }: { requestId: string; supplierIds: string[]; subject: string; body: string }) =>
      sendQuoteRequest(supabase, requestId, supplierIds, subject, body),
    onSuccess: invalidate,
  });
}

/** Upload a quote file, let the AI read it, and keep it as a quote row (fields editable afterwards). */
export function useImportQuoteFile() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ request, file, suppliers }: { request: Pick<VehicleRequest, "id" | "company_id">; file: File; suppliers: Supplier[] }) => {
      const path = await uploadQuoteFile(supabase, request, file);
      let fields: Awaited<ReturnType<typeof extractQuote>>["fields"] | null = null;
      let extractError: string | null = null;
      try {
        fields = (await extractQuote(supabase, request.id, path)).fields;
      } catch (e) {
        extractError = e instanceof Error ? e.message : String(e);
      }
      const supplier = fields?.supplier_name
        ? suppliers.find((s) => s.name.includes(fields!.supplier_name!) || fields!.supplier_name!.includes(s.name))
        : undefined;
      await saveQuote(supabase, {
        request_id: request.id,
        supplier_id: supplier?.id ?? null,
        model: fields?.model ?? null,
        monthly_price: fields?.monthly_price ?? null,
        km_per_year: fields?.km_per_year ?? null,
        period_months: fields?.period_months ?? null,
        delivery_date: fields?.delivery_date ?? null,
        includes: fields?.includes ?? null,
        file_path: path,
        extracted: fields,
      });
      return { extracted: !!fields, extractError, supplierMatched: !!supplier };
    },
    onSuccess: invalidate,
  });
}
