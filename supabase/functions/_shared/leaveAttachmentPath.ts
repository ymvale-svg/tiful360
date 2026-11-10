/**
 * Object path of a leave attachment in the private `leave-attachments` bucket.
 * Accepts a bare path (current format) or a legacy full signed URL
 * (`…/storage/v1/object/sign/leave-attachments/<path>?token=…`).
 * Returns null when the value isn't parseable.
 *
 * Mirror of src/lib/leaveAttachmentPath.ts — keep in sync.
 */
const SIGNED_PREFIX = "/storage/v1/object/sign/leave-attachments/";

function cleanPath(path: string): string | null {
  if (!path || path.startsWith("/") || path.includes("\\")) return null;
  if (path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return path;
}

export function leaveAttachmentPath(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
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
