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

/** Domain tag next to an expiring item. The word carries the meaning, so the tag stays neutral. */
export const DOMAIN_STYLES: Record<ProtocolDomain, string> = {
  physical: "bg-muted text-foreground",
  vehicle: "bg-muted text-foreground",
  digital: "bg-muted text-foreground",
  license: "bg-muted text-foreground",
  insurance: "bg-muted text-foreground",
  training: "bg-muted text-foreground",
  real_estate: "bg-muted text-foreground",
};

export interface ExpiringAsset {
  asset_id: string;
  asset_name: string;
  asset_code: string;
  category_id: string | null;
  category_name: string;
  category_prefix: string;
  is_assignable: boolean;
  source_type:
    | "asset"
    | "custom_field"
    | "document"
    | "digital_access"
    | "vehicle_test"
    | "vehicle_insurance"
    | "vehicle_license";
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
  // Every lapsed item used to read "פג תוקף!" whether it expired yesterday or
  // four months ago, which hid how far behind the list had drifted.
  if (daysLeft <= 0) {
    const overdue = Math.abs(daysLeft);
    const months = Math.floor(overdue / 30);
    const label =
      overdue === 0 ? "פג היום"
      : overdue === 1 ? "פג אתמול"
      : overdue === 2 ? "פג לפני יומיים"
      : overdue < 31 ? `פג לפני ${overdue} ימים`
      : months === 1 ? "פג לפני חודש"
      : months === 2 ? "פג לפני חודשיים"
      : `פג לפני ${months} חודשים`;
    return { color: "text-destructive-text", bg: "bg-destructive/10", border: "border-destructive/30", label };
  }
  if (daysLeft <= 3) return { color: "text-warning-text font-semibold", bg: "bg-warning/10", border: "border-warning/60", label: `${daysLeft} ימים` };
  return { color: "text-warning-text", bg: "bg-warning/10", border: "border-warning/30", label: `${daysLeft} ימים` };
}
