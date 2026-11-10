import { supabase } from "@/integrations/supabase/client";
import * as tus from "tus-js-client";

export type UploadStage = "prepare" | "upload" | "save" | "done" | "error";
export interface UploadJob {
  id: string;
  name: string;
  stage: UploadStage;
  percent: number;
  error?: string;
  /** Optional progress line, e.g. "שורה 37 מתוך 120" for bulk jobs. */
  detail?: string;
  /** Bulk jobs (imports, multi-row saves) show a count instead of upload stages. */
  kind?: "upload" | "batch";
  /** File size in bytes, for "2.1MB מתוך 7.7MB". */
  size?: number;
  /** When bytes started moving (ms), for the time-remaining estimate. */
  startedAt?: number;
  /** Stops the transfer; the caller receives the "ההעלאה בוטלה" error. */
  cancel?: () => void;
}

export const UPLOAD_CANCELLED = "ההעלאה בוטלה";

let jobs: UploadJob[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export const uploadJobs = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  get: () => jobs,
  update(id: string, patch: Partial<UploadJob>) { jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)); emit(); },
  add(job: UploadJob) { jobs = [...jobs.filter((j) => j.id !== job.id), job]; emit(); },
  remove(id: string) { jobs = jobs.filter((j) => j.id !== id); emit(); },
};

/** Hebrew, plain-language error for common upload failures. */
export function translateUploadError(status: number, message = ""): string {
  const m = message.toLowerCase();
  if (status === 0 || m.includes("network")) return "אין חיבור לאינטרנט — בדקו את החיבור ונסו שוב";
  if (status === 413 || m.includes("size") || m.includes("too large")) return "הקובץ גדול מדי";
  if (status === 401 || status === 403 || m.includes("row-level") || m.includes("unauthorized")) return "אין הרשאה להעלות את הקובץ";
  if (status === 409 || m.includes("exists")) return "קובץ בשם זה כבר קיים";
  if (m.includes("mime") || m.includes("type")) return "סוג הקובץ אינו נתמך";
  return "ההעלאה נכשלה — נסו שוב";
}

interface Opts { contentType?: string; upsert?: boolean; cacheControl?: string }
type Result = { data: { path: string; fullPath: string } | null; error: Error | null };

function send(bucket: string, path: string, file: Blob, opts: Opts, token: string, onProgress: (p: number) => void, onCancelable: (cancel: () => void) => void): Promise<Result> {
  return new Promise((resolve) => {
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const url = `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", opts.upsert ? "true" : "false");
    xhr.setRequestHeader("cache-control", `max-age=${opts.cacheControl ?? "3600"}`);
    xhr.setRequestHeader("Content-Type", opts.contentType || (file as File).type || "application/octet-stream");
    // Watchdog: abort if no bytes move for STALL_MS so the user is never left on a frozen percentage.
    let stall: ReturnType<typeof setTimeout>;
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => { stalled = true; xhr.abort(); }, STALL_MS); };
    let stalled = false;
    xhr.upload.onprogress = (e) => { arm(); if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      clearTimeout(stall);
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ data: { path, fullPath: `${bucket}/${path}` }, error: null });
      let msg = xhr.responseText;
      try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch { /* keep text */ }
      const err = new Error(translateUploadError(xhr.status, msg));
      (err as Error & { statusCode?: string }).statusCode = String(xhr.status);
      resolve({ data: null, error: err });
    };
    xhr.onerror = () => { clearTimeout(stall); resolve({ data: null, error: new Error(translateUploadError(0)) }); };
    xhr.onabort = () => resolve({ data: null, error: new Error(stalled ? STALL_MSG : UPLOAD_CANCELLED) });
    onCancelable(() => xhr.abort());
    arm();
    xhr.send(file);
  });
}

const STALL_MS = 60_000;
const STALL_MSG = "ההעלאה נתקעה — החיבור איטי מדי. נסו שוב";
const RESUMABLE_FROM = 6 * 1024 * 1024;

/** Large files go in 6MB chunks with automatic resume, so a slow or flaky connection keeps progressing. */
function sendResumable(bucket: string, path: string, file: Blob, opts: Opts, token: string, onProgress: (p: number) => void, onCancelable: (cancel: () => void) => void): Promise<Result> {
  return new Promise((resolve) => {
    const base = import.meta.env.VITE_SUPABASE_URL as string;
    let stall: ReturnType<typeof setTimeout>;
    const upload = new tus.Upload(file, {
      endpoint: `${base}/storage/v1/upload/resumable`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, "x-upsert": opts.upsert ? "true" : "false" },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: bucket, objectName: path, contentType: opts.contentType || (file as File).type || "application/octet-stream", cacheControl: opts.cacheControl ?? "3600" },
      onProgress: (sent, total) => { arm(); onProgress(Math.round((sent / total) * 100)); },
      onSuccess: () => { clearTimeout(stall); resolve({ data: { path, fullPath: `${bucket}/${path}` }, error: null }); },
      onError: (e) => {
        clearTimeout(stall);
        const status = (e as tus.DetailedError).originalResponse?.getStatus() ?? 0;
        resolve({ data: null, error: new Error(translateUploadError(status, (e as tus.DetailedError).originalResponse?.getBody() ?? e.message)) });
      },
    });
    const arm = () => { clearTimeout(stall); stall = setTimeout(() => { void upload.abort(); resolve({ data: null, error: new Error(STALL_MSG) }); }, STALL_MS * 2); };
    onCancelable(() => { clearTimeout(stall); void upload.abort(); resolve({ data: null, error: new Error(UPLOAD_CANCELLED) }); });
    arm();
    upload.start();
  });
}

/** Drop-in replacement for supabase.storage.from(bucket).upload(path, file, opts) with a visible progress donut. */
export async function uploadFile(bucket: string, path: string, file: Blob, opts: Opts = {}): Promise<Result> {
  const id = `${bucket}/${path}/${Date.now()}`;
  const name = (file as File).name || path.split("/").pop() || "קובץ";
  const run = async (): Promise<Result> => {
    uploadJobs.add({ id, name, stage: "prepare", percent: 0, size: file.size });
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
    uploadJobs.update(id, { stage: "upload", startedAt: Date.now() });
    const sender = file.size >= RESUMABLE_FROM ? sendResumable : send;
    const res = await sender(bucket, path, file, opts, token,
      (p) => uploadJobs.update(id, { percent: p }),
      (cancel) => uploadJobs.update(id, { cancel }));
    if (res.error) {
      // No retry from the progress card: the caller already got this error, so a re-upload started
      // here would never be linked to its record. The user retries from the screen that started it.
      if (res.error.message === UPLOAD_CANCELLED) uploadJobs.remove(id);
      else uploadJobs.update(id, { stage: "error", error: res.error.message, cancel: undefined });
      return res;
    }
    uploadJobs.update(id, { stage: "done", percent: 100, cancel: undefined });
    setTimeout(() => uploadJobs.remove(id), 4500);
    return res;
  };
  return run();
}
