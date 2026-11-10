import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { runBatch } from "@/lib/batchProgress";
import type { ReportPunch } from "@/lib/attendanceLocationReport";

const PAGE = 1000;

/** All punches of employees the caller may see, from the day before `from` to the day after `to`. */
export function useAttendanceLocationReport(from: string, to: string, enabled = true) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["attendance_location_report", activeCompanyId, from, to],
    enabled: enabled && !!activeCompanyId && !!from && !!to && from <= to,
    queryFn: async () => {
      const all: ReportPunch[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .rpc("get_attendance_location_report", { _company_id: activeCompanyId!, _from: from, _to: to })
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as ReportPunch[];
        all.push(...page);
        if (page.length < PAGE) break;
      }
      return all;
    },
  });
}

const CHUNK = 50;
const MAX_ROUNDS_PER_CHUNK = 15;

/**
 * Asks the reverse-geocode edge function to store addresses for these punches, in chunks,
 * showing progress in the progress center. The function resolves a limited number of new
 * places per call (OpenStreetMap allows one lookup per second), so each chunk is retried
 * until nothing is left or a call makes no progress.
 */
export async function resolvePunchAddresses(punchIds: readonly string[]) {
  const chunks: string[][] = [];
  for (let i = 0; i < punchIds.length; i += CHUNK) chunks.push(punchIds.slice(i, i + CHUNK));
  return runBatch(
    chunks,
    async (ids) => {
      for (let round = 0; round < MAX_ROUNDS_PER_CHUNK; round++) {
        const { data, error } = await supabase.functions.invoke("reverse-geocode", { body: { punch_ids: ids } });
        if (error) throw new Error("שירות הכתובות לא זמין כרגע");
        const { resolved = 0, remaining = 0 } = (data ?? {}) as { resolved?: number; remaining?: number };
        if (remaining === 0) return;
        if (resolved === 0) throw new Error("חלק מהכתובות לא נמצאו");
      }
    },
    { name: "השלמת כתובות להחתמות", unit: "קבוצה" },
  );
}

/** Fire-and-forget address lookup right after a punch is saved. Never blocks or fails the punch. */
export function resolvePunchAddressInBackground(punchId: string | null | undefined) {
  if (!punchId) return;
  supabase.functions.invoke("reverse-geocode", { body: { punch_ids: [punchId] } }).catch(() => undefined);
}
