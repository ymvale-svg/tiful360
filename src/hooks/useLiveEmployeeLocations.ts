import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useEffect } from "react";

export interface LiveEmployeeLocation {
  employee_id: string;
  full_name: string;
  department: string | null;
  role: string | null;
  punch_id: string;
  punch_at: string;
  direction: "in" | "out" | "unknown";
  lat: number;
  lng: number;
  accuracy: number | null;
}

export function useLiveEmployeeLocations() {
  const { activeCompanyId } = useCompany();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["live_employee_locations", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [] as LiveEmployeeLocation[];
      const { data, error } = await supabase.rpc("get_live_employee_locations", {
        _company_id: activeCompanyId,
      });
      if (error) throw error;
      return (data ?? []) as LiveEmployeeLocation[];
    },
    enabled: !!activeCompanyId,
    refetchInterval: 60000,
  });

  useEffect(() => {
    if (!activeCompanyId) return;
    const ch = supabase
      .channel(`live_locations_${activeCompanyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_punches", filter: `company_id=eq.${activeCompanyId}` },
        () => qc.invalidateQueries({ queryKey: ["live_employee_locations", activeCompanyId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeCompanyId, qc]);

  return query;
}
