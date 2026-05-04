import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface ExpiringAsset {
  asset_id: string;
  asset_name: string;
  asset_code: string;
  category_id: string;
  category_name: string;
  category_prefix: string;
  is_assignable: boolean;
  source_type: "asset" | "custom_field" | "document";
  source_id: string;
  field_key: string | null;
  field_label: string;
  expiry_date: string;
  days_left: number;
  current_owner_id: string | null;
  owner_name: string | null;
  custom_fields: Record<string, any> | null;
}

export function useExpiringAssets(daysAhead = 14) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["expiring-assets", activeCompanyId, daysAhead],
    queryFn: async (): Promise<ExpiringAsset[]> => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase.rpc("get_expiring_assets", {
        _company_id: activeCompanyId,
        _days_ahead: daysAhead,
      });
      if (error) throw error;
      return (data ?? []) as ExpiringAsset[];
    },
    enabled: !!activeCompanyId,
  });
}

export function expiryUrgency(daysLeft: number): {
  color: string;
  bg: string;
  label: string;
  border: string;
} {
  if (daysLeft <= 0) return { color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", label: "פג תוקף!" };
  if (daysLeft <= 3) return { color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", label: `${daysLeft} ימים` };
  return { color: "text-yellow-700 dark:text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: `${daysLeft} ימים` };
}
