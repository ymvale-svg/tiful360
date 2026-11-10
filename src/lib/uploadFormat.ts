const UNITS = ["B", "KB", "MB", "GB"] as const;

/** "512 KB", "6.6 MB". One decimal from MB up; whole numbers below. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** i;
  return `${i >= 2 ? value.toFixed(1) : Math.round(value)} ${UNITS[i]}`;
}

/**
 * Time left, extrapolated from the progress so far: "עוד 45 שניות", "עוד 2 דקות".
 * Null until there is enough signal (2s elapsed and 3% done), so the estimate doesn't jump.
 */
export function timeLeft(percent: number, startedAt: number | undefined, now = Date.now()): string | null {
  if (!startedAt || percent < 3 || percent >= 100) return null;
  const elapsed = (now - startedAt) / 1000;
  if (elapsed < 2) return null;
  const seconds = Math.round((elapsed * (100 - percent)) / percent);
  if (seconds < 5) return "כמעט סיים";
  if (seconds < 60) return `עוד ${Math.ceil(seconds / 5) * 5} שניות`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "עוד דקה" : `עוד ${minutes} דקות`;
}

export type FileKind = "pdf" | "image" | "sheet" | "doc" | "archive" | "video" | "other";

/** Broad file kind from the name, for the card's icon and colour. */
export function fileKind(name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic", "svg"].includes(ext)) return "image";
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "sheet";
  if (["doc", "docx", "odt", "rtf", "txt"].includes(ext)) return "doc";
  if (["zip", "rar", "7z"].includes(ext)) return "archive";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  return "other";
}
