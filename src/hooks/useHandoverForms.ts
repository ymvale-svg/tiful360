import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HandoverFormRow {
  id: string;
  asset_id: string;
  employee_id: string;
  direction: string;
  protocol_type: string;
  status: string;
  pdf_url: string | null;
  attached_document_url: string | null;
  signed_at: string | null;
  created_at: string;
  form_snapshot: any;
}

const SELECT =
  "id, asset_id, employee_id, direction, protocol_type, status, pdf_url, attached_document_url, signed_at, created_at, form_snapshot";

/** Signed handover / return protocols of a single asset (item card). */
export function useAssetHandoverForms(assetId?: string) {
  return useQuery({
    queryKey: ["handover-forms", "asset", assetId],
    enabled: !!assetId,
    queryFn: async (): Promise<HandoverFormRow[]> => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select(SELECT)
        .eq("asset_id", assetId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

/** Signed protocols of a single employee (personal portal / employee file). */
export function useEmployeeHandoverForms(employeeId?: string) {
  return useQuery({
    queryKey: ["handover-forms", "employee", employeeId],
    enabled: !!employeeId,
    queryFn: async (): Promise<HandoverFormRow[]> => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select(SELECT)
        .eq("employee_id", employeeId!)
        .eq("status", "signed")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}
