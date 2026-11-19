import { useSyncExternalStore } from "react";
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

const CHUNK = 20;
const MAX_ROUNDS_PER_CHUNK = 15;
const FAILED_AT_KEY = "attendance-geo-resolve-failed-at";
const AUTO_RETRY_AFTER_MS = 30 * 60 * 1000;

// One address run for the whole app: a punch already being resolved is never sent
// again, even when the report screen is opened twice or remounted mid-run.
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** True while any address run is in progress (shared by every mounted report). */
export function useAddressResolving(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => inFlight.size > 0,
  );
}

/** Automatic runs pause for 30 minutes after a failed run; the manual button still works. */
export function canAutoResolve(): boolean {
  try {
    const at = Number(localStorage.getItem(FAILED_AT_KEY) ?? 0);
    return !at || Date.now() - at > AUTO_RETRY_AFTER_MS;
  } catch {
    return true;
  }
}

function rememberFailure(failed: boolean) {
  try {
    if (failed) localStorage.setItem(FAILED_AT_KEY, String(Date.now()));
    else localStorage.removeItem(FAILED_AT_KEY);
  } catch {
    // Storage blocked: automatic runs simply aren't paused.
  }
}

/** Hebrew reason for a failed run, from the edge function's error codes. */
function describeErrors(codes: string[]): string {
  const all = codes.join(" ");
  if (/permission/.test(all)) return "אין הרשאה להשלים כתובות להחתמות האלה.";
  if (/photon_(403|429)/.test(all)) return "שירות הכתובות החינמי חסם או האט את הבקשות. נסו שוב מאוחר יותר.";
  if (/photon_(network|bad_body|5\d\d)/.test(all)) return "שירות הכתובות לא הגיב.";
  if (/update/.test(all)) return "הכתובות נמצאו אבל לא נשמרו.";
  return "שירות הכתובות לא זמין כרגע.";
}

export interface ResolveResult {
  done: number;
  failed: number;
  reason: string | null;
}

/**
 * Asks the reverse-geocode edge function to store addresses for these punches, in chunks,
 * showing progress in the progress center. The function resolves a limited number of new
 * places per call (OpenStreetMap allows one lookup per second), so each chunk is retried
 * until nothing is left or a call makes no progress. `onChunkDone` runs after every call that
 * stored addresses, so the screen can show them as they arrive.
 */
export async function resolvePunchAddresses(punchIds: readonly string[], onChunkDone?: () => void): Promise<ResolveResult> {
  const ids = punchIds.filter((id) => !inFlight.has(id));
  if (ids.length === 0) return { done: 0, failed: 0, reason: null };
  ids.forEach((id) => inFlight.add(id));
  notify();

  const codes: string[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  try {
    const res = await runBatch(
      chunks,
      async (chunk) => {
        for (let round = 0; round < MAX_ROUNDS_PER_CHUNK; round++) {
          const { data, error } = await supabase.functions.invoke("reverse-geocode", { body: { punch_ids: chunk } });
          if (error) {
            let reason = "unavailable";
            try {
              const ctx = (error as { context?: Response }).context;
              const body = ctx ? await ctx.json() : null;
              reason = [body?.error, body?.reason].filter(Boolean).join(" ") || reason;
            } catch {
              // Body not readable: keep the generic reason.
            }
            codes.push(reason);
            throw new Error(reason);
          }
          const { resolved = 0, remaining = 0, errors = [] } =
            (data ?? {}) as { resolved?: number; remaining?: number; errors?: string[] };
          codes.push(...errors);
          if (resolved > 0) onChunkDone?.();
          if (remaining === 0) return;
          if (resolved === 0) throw new Error(errors[0] ?? "no_progress");
        }
      },
      { name: "השלמת כתובות להחתמות", unit: "קבוצה" },
    );
    rememberFailure(res.failed.length > 0);
    return {
      done: res.done,
      failed: res.failed.length,
      reason: res.failed.length ? describeErrors(codes) : null,
    };
  } finally {
    ids.forEach((id) => inFlight.delete(id));
    notify();
  }
}

/** Fire-and-forget address lookup right after a punch is saved. Never blocks or fails the punch. */
export function resolvePunchAddressInBackground(punchId: string | null | undefined) {
  if (!punchId) return;
  supabase.functions.invoke("reverse-geocode", { body: { punch_ids: [punchId] } }).catch(() => undefined);
}
