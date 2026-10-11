import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

/**
 * The active company's holiday dates as a Set of "YYYY-MM-DD" strings.
 * Used by attendance and business-hours logic to treat holidays as non-working days.
 */
export function useCompanyHolidaySet() {
  const { activeCompanyId } = useCompany();
  const { data } = useQuery({
    queryKey: ["company_holidays", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_holidays" as any)
        .select("holiday_date")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  return useMemo(
    () => new Set((data ?? []).map((h: any) => String(h.holiday_date).slice(0, 10))),
    [data],
  );
}
