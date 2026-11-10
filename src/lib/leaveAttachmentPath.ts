/**
 * Leave attachments (sick notes / reserve-duty certificates) live in the
 * private `leave-attachments` bucket. `leave_requests.attachment_url` stores
 * only the object path; a short-lived signed URL is created each time someone
 * opens the file.
 *
 * Older rows stored a full signed URL
 * (`…/storage/v1/object/sign/leave-attachments/<path>?token=…`). Those are
 * accepted here too: the object path is extracted so the file can be re-signed.
 *
 * Returns null when the value can't be turned into a path in this bucket.
 *
 * Keep in sync with supabase/functions/_shared/leaveAttachmentPath.ts.
 */
export const LEAVE_ATTACHMENTS_BUCKET = "leave-attachments";

const SIGNED_PREFIX = `/storage/v1/object/sign/${LEAVE_ATTACHMENTS_BUCKET}/`;

function cleanPath(path: string): string | null {
  if (!path || path.startsWith("/") || path.includes("\\")) return null;
  if (path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return path;
}

export function leaveAttachmentPath(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;

  // Anything with a URL scheme must be a legacy signed URL for this bucket.
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.pathname.startsWith(SIGNED_PREFIX)) return null;
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname.slice(SIGNED_PREFIX.length));
    } catch {
      return null;
    }
    return cleanPath(decoded);
  }

  if (v.includes("?") || v.includes("#")) return null;
  return cleanPath(v);
}
