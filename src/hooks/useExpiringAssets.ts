import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export type ProtocolDomain =
  | "physical"
  | "vehicle"
  | "digital"
  | "license"
  | "insurance"
  | "training"
  | "real_estate";

export const DOMAIN_LABELS: Record<ProtocolDomain, string> = {
  physical: "ציוד",
  vehicle: "רכב",
  digital: "גישה דיגיטלית",
  license: "רישיון",
  insurance: "ביטוח",
  training: "הדרכה",
  real_estate: "נדל\"ן",
};

export const DOMAIN_STYLES: Record<ProtocolDomain, string> = {
  physical: "bg-muted text-foreground",
  vehicle: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  digital: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  license: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  insurance: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  training: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
  real_estate: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
};

export interface ExpiringAsset {
  asset_id: string;
  asset_name: string;
  asset_code: string;
  category_id: string | null;
  category_name: string;
  category_prefix: string;
  is_assignable: boolean;
  source_type: "asset" | "custom_field" | "document" | "digital_access";
  source_id: string;
  field_key: string | null;
  field_label: string;
  expiry_date: string;
  days_left: number;
  current_owner_id: string | null;
  owner_name: string | null;
  custom_fields: Record<string, any> | null;
  domain: ProtocolDomain;
  expiry_type: string;
  assignee_role: "it" | "operations" | "legal" | "hr";
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
