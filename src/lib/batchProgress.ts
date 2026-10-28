import { uploadJobs } from "@/lib/uploadWithProgress";

export interface BatchResult<T> {
  done: number;
  failed: { item: T; index: number; error: string }[];
}

interface BatchOptions {
  /** Card title in the progress center, e.g. "ייבוא עובדים מאקסל". */
  name: string;
  /** Noun for the counter: "שורה 37 מתוך 120". */
  unit?: string;
}

/**
 * Runs `work` for each item in order and shows "<unit> i מתוך N" in the progress center, so long
 * imports and multi-row saves are never a bare spinner. One failed item doesn't stop the rest;
 * the failures come back so the screen can list them.
 */
export async function runBatch<T>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<unknown>,
  { name, unit = "שורה" }: BatchOptions,
): Promise<BatchResult<T>> {
  const id = `batch/${name}/${Date.now()}`;
  const total = items.length;
  const failed: BatchResult<T>["failed"] = [];
  uploadJobs.add({ id, name, kind: "batch", stage: "upload", percent: 0, detail: `${unit} 0 מתוך ${total}` });
  for (let i = 0; i < total; i++) {
    uploadJobs.update(id, { detail: `${unit} ${i + 1} מתוך ${total}`, percent: Math.round((i / total) * 100) });
    try {
      await work(items[i], i);
    } catch (e) {
      failed.push({ item: items[i], index: i, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const done = total - failed.length;
  if (failed.length) {
    uploadJobs.update(id, { stage: "error", percent: 100, error: `${done} מתוך ${total} הושלמו, ${failed.length} נכשלו` });
  } else {
    uploadJobs.update(id, { stage: "done", percent: 100, detail: `${total} מתוך ${total} הושלמו` });
    setTimeout(() => uploadJobs.remove(id), 4000);
  }
  return { done, failed };
}
