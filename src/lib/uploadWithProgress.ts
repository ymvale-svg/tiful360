import { supabase } from "@/integrations/supabase/client";

export type UploadStage = "prepare" | "upload" | "save" | "done" | "error";
export interface UploadJob {
  id: string;
  name: string;
  stage: UploadStage;
  percent: number;
  error?: string;
  retry?: () => void;
}

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

function send(bucket: string, path: string, file: Blob, opts: Opts, token: string, onProgress: (p: number) => void): Promise<Result> {
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
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve({ data: { path, fullPath: `${bucket}/${path}` }, error: null });
      let msg = xhr.responseText;
      try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch { /* keep text */ }
      const err = new Error(translateUploadError(xhr.status, msg));
      (err as Error & { statusCode?: string }).statusCode = String(xhr.status);
      resolve({ data: null, error: err });
    };
    xhr.onerror = () => resolve({ data: null, error: new Error(translateUploadError(0)) });
    xhr.send(file);
  });
}

/** Drop-in replacement for supabase.storage.from(bucket).upload(path, file, opts) with a visible progress donut. */
export async function uploadFile(bucket: string, path: string, file: Blob, opts: Opts = {}): Promise<Result> {
  const id = `${bucket}/${path}/${Date.now()}`;
  const name = (file as File).name || path.split("/").pop() || "קובץ";
  const run = async (): Promise<Result> => {
    uploadJobs.add({ id, name, stage: "prepare", percent: 0 });
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);
    uploadJobs.update(id, { stage: "upload" });
    const res = await send(bucket, path, file, opts, token, (p) => uploadJobs.update(id, { percent: p }));
    if (res.error) {
      uploadJobs.update(id, { stage: "error", error: res.error.message, retry: () => { void run(); } });
      return res;
    }
    uploadJobs.update(id, { stage: "save", percent: 100 });
    setTimeout(() => uploadJobs.update(id, { stage: "done" }), 500);
    setTimeout(() => uploadJobs.remove(id), 4500);
    return res;
  };
  return run();
}
