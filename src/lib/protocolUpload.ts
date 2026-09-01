import { supabase } from "@/integrations/supabase/client";

/** Practical ceiling for a single file uploaded to storage (server rejects larger with an HTML error page). */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024; // 45MB
/** Images above this size are downscaled/recompressed in the browser before upload. */
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const IMAGE_MAX_DIMENSION = 2000;

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.round(bytes / 1024)}KB`;
};

/** Turn opaque storage failures (HTML gateway pages, 413s, JSON parse errors) into a readable Hebrew message. */
export function describeUploadError(err: unknown, fileName?: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const suffix = fileName ? ` (${fileName})` : "";
  if (/Unexpected token '<'|not valid JSON|<html/i.test(raw)) {
    return `העלאת הקובץ נכשלה — ככל הנראה הקובץ גדול מדי או שהחיבור נותק${suffix}. נסה לצלם סרטון קצר יותר או להעלות פחות תמונות.`;
  }
  if (/exceeded the maximum allowed size|payload too large|413/i.test(raw)) {
    return `הקובץ חורג מהגודל המרבי המותר (${formatBytes(MAX_UPLOAD_BYTES)})${suffix}.`;
  }
  if (/Failed to fetch|NetworkError|network/i.test(raw)) {
    return `החיבור נותק במהלך ההעלאה${suffix}. בדוק את החיבור לאינטרנט ונסה שוב.`;
  }
  return raw || "אירעה שגיאה בשמירת הפרוטוקול";
}

/** Downscale + recompress large images so phone photos don't blow past the upload limit. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size <= IMAGE_COMPRESS_THRESHOLD) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82)
    );
    bitmap.close?.();
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload a protocol asset (photo/video/pdf) with size validation and friendly errors. */
export async function uploadProtocolFile(
  bucket: string,
  path: string,
  file: Blob,
  contentType?: string,
  fileName?: string
): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `הקובץ${fileName ? ` "${fileName}"` : ""} במשקל ${formatBytes(file.size)} חורג מהמותר (${formatBytes(
        MAX_UPLOAD_BYTES
      )}). צלם סרטון קצר יותר או העלה קובץ קטן יותר.`
    );
  }
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: contentType ?? (file as File).type, upsert: true });
    if (error) throw error;
  } catch (e) {
    throw new Error(describeUploadError(e, fileName));
  }
  // Return the object path, not a public URL. handover-forms is a private
  // bucket, and a URL captured here would be a permanent unauthenticated link
  // to a signed protocol. Readers sign on demand via `getHandoverSignedUrl`.
  return path;
}
