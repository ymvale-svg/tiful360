import { supabase } from "@/integrations/supabase/client";
import { uploadJobs, translateUploadError } from "@/lib/uploadWithProgress";

/**
 * PUTs the file to the signed upload URL with XHR so the progress center can show a percentage
 * (supabase-js uploadToSignedUrl has no progress events). Resolves false on any failure so the
 * caller can fall back to the SDK path.
 */
function putWithProgress(signedUrl: string, file: Blob, contentType: string, name: string): Promise<boolean> {
  const id = `signed/${name}/${Date.now()}`;
  uploadJobs.add({ id, name, stage: "upload", percent: 0 });
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Content-Type", contentType);
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (key) {
      xhr.setRequestHeader("apikey", key);
      xhr.setRequestHeader("Authorization", `Bearer ${key}`);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) uploadJobs.update(id, { percent: Math.round((e.loaded / e.total) * 100) });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        uploadJobs.update(id, { stage: "done", percent: 100 });
        setTimeout(() => uploadJobs.remove(id), 4500);
        resolve(true);
      } else {
        uploadJobs.remove(id);
        resolve(false);
      }
    };
    xhr.onerror = () => { uploadJobs.remove(id); resolve(false); };
    xhr.onabort = () => { uploadJobs.remove(id); resolve(false); };
    xhr.send(file);
  });
}

/**
 * For unauthenticated signing flows: requests a short-lived signed upload URL
 * from the edge function (which validates the sign_token), then uploads the file.
 * Returns the storage object path; read it back with `getHandoverSignedUrl`.
 */
export async function uploadViaSignedToken(params: {
  sign_token: string;
  form_type: "handover" | "offboarding";
  kind: "attachment" | "pdf";
  file: Blob | File;
  filename?: string;
  contentType?: string;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sign-form-upload-url", {
    body: {
      sign_token: params.sign_token,
      form_type: params.form_type,
      kind: params.kind,
      filename: params.filename ?? (params.file instanceof File ? params.file.name : undefined),
      content_type: params.contentType,
    },
  });
  if (error) throw error;
  if (!data?.signed_url || !data?.path || !data?.token) {
    throw new Error("Invalid sign URL response");
  }

  const contentType = params.contentType ?? (params.file instanceof File && params.file.type ? params.file.type : "application/octet-stream");
  const name = params.filename ?? (params.file instanceof File ? params.file.name : params.kind === "pdf" ? "טופס חתום" : "קובץ");
  if (await putWithProgress(data.signed_url as string, params.file, contentType, name)) return data.path as string;

  // Fallback: the SDK path (same signed token, upsert), without progress.
  const { error: upErr } = await supabase.storage
    .from("handover-forms")
    .uploadToSignedUrl(data.path, data.token, params.file, { contentType, upsert: true });
  if (upErr) {
    const status = Number((upErr as { statusCode?: string }).statusCode ?? 0);
    throw new Error(translateUploadError(status, upErr.message));
  }
  return data.path as string;
}
