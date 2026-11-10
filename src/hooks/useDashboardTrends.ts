import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { dateOnly, dayEnds, percentChange, rebuildSeries, type TrendRow } from "@/lib/kpiTrends";

const DAYS = 14;

export interface KpiTrend {
  series: number[];
  labels: string[];
  delta?: number;
}

type Current = { activeEmployees: number; totalAssets: number; openAlerts: number; openTickets: number };

/**
 * Two-week sparklines for the dashboard KPIs, rebuilt from dates the rows already carry (created,
 * resolved, start and end dates). Only rows that changed inside the window are fetched.
 */
export function useDashboardTrends(current: Current | undefined) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["dashboard-trends", activeCompanyId, current],
    enabled: !!current,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<keyof Current, KpiTrend>> => {
      const ends = dayEnds(DAYS);
      const start = new Date(ends[0].getFullYear(), ends[0].getMonth(), ends[0].getDate()).toISOString();
      const startDay = start.slice(0, 10);
      let ticketQ = supabase.from("it_tickets").select("created_at,resolved_at,status").or(`created_at.gte.${start},resolved_at.gte.${start}`);
      let alertQ = supabase.from("alerts").select("created_at,resolved_at,is_resolved").or(`created_at.gte.${start},resolved_at.gte.${start}`);
      let empQ = supabase.from("employees").select("start_date,end_date,status").or(`start_date.gte.${startDay},end_date.gte.${startDay}`);
      let assetQ = supabase.from("assets").select("created_at").gte("created_at", start);
      if (activeCompanyId) {
        ticketQ = ticketQ.eq("company_id", activeCompanyId);
        alertQ = alertQ.eq("company_id", activeCompanyId);
        empQ = empQ.eq("company_id", activeCompanyId);
        assetQ = assetQ.eq("company_id", activeCompanyId);
      }
      const [tickets, alerts, employees, assets] = await Promise.all([ticketQ, alertQ, empQ, assetQ]);
      for (const r of [tickets, alerts, employees, assets]) if (r.error) throw r.error;

      const labels = ends.map((d) => d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }));
      const build = (now: number, rows: TrendRow[]): KpiTrend => {
        const series = rebuildSeries(now, rows, ends);
        return { series, labels, delta: percentChange(series) };
      };

      return {
        openTickets: build(current!.openTickets, (tickets.data ?? []).map((t) => ({
          from: new Date(t.created_at), until: t.resolved_at ? new Date(t.resolved_at) : null, countedNow: t.status !== "done",
        }))),
        openAlerts: build(current!.openAlerts, (alerts.data ?? []).map((a) => ({
          from: new Date(a.created_at), until: a.resolved_at ? new Date(a.resolved_at) : null, countedNow: !a.is_resolved,
        }))),
        activeEmployees: build(current!.activeEmployees, (employees.data ?? []).map((e) => ({
          from: dateOnly(e.start_date), until: dateOnly(e.end_date), countedNow: e.status === "active",
        }))),
        totalAssets: build(current!.totalAssets, (assets.data ?? []).map((a) => ({
          from: new Date(a.created_at), until: null, countedNow: true,
        }))),
      };
    },
  });
}
