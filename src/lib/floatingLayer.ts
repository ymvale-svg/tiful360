import { useSyncExternalStore } from "react";
import { uploadJobs } from "@/lib/uploadWithProgress";

/**
 * One stacking/offset scheme for the app's floating widgets, so they never cover each other:
 *
 *   z-40  page-level floaters: AI launcher, install banner, portal tab bar
 *   z-50  open panels/prompts: AI chat panel, PWA update prompt
 *   z-[100] UploadProgressCenter (bottom-left, w-80) — always on top while a job runs
 *
 * While upload/batch jobs exist, the AI launcher steps aside (beside the progress center on wide
 * screens, above it on phones) and the install banner hides. All bottom offsets add the
 * safe-area inset so nothing sits under the iPhone home indicator.
 */

/** Number of jobs currently shown in the upload progress center. */
export function useUploadJobCount(): number {
  return useSyncExternalStore(uploadJobs.subscribe, () => uploadJobs.get().length, () => 0);
}

/** Approximate height of one progress-center card, incl. gap (px). */
const UPLOAD_CARD_PX = 96;
/** Progress-center width (w-80) + its left-4 margin + a gap (px). */
const UPLOAD_CENTER_SPAN_PX = 16 + 320 + 12;

/**
 * Inline position for a bottom-left launcher that must clear the upload progress center.
 * Narrow screens (the progress center spans the width) stack it above the cards;
 * wider screens put it beside them.
 */
export function launcherOffset(jobCount: number, viewportWidth: number, base = 16): { left: number; bottom: string } {
  if (jobCount <= 0) return { left: base, bottom: `calc(${base}px + env(safe-area-inset-bottom, 0px))` };
  if (viewportWidth < 640) {
    return { left: base, bottom: `calc(${base + jobCount * UPLOAD_CARD_PX + 8}px + env(safe-area-inset-bottom, 0px))` };
  }
  return { left: UPLOAD_CENTER_SPAN_PX, bottom: `calc(${base}px + env(safe-area-inset-bottom, 0px))` };
}
