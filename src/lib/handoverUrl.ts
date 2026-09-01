import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Access helpers for the private `handover-forms` bucket.
 *
 * The bucket was public until 2026-09-01, so `pdf_url`, `attached_document_url`
 * and the `media[].url` entries in older rows hold a permanent public URL.
 * Newer writes store the object path only. Everything here accepts either and
 * signs on demand — mirrors `tax101Url.ts`.
 */

const BUCKET = "handover-forms";
const MARKER = "/handover-forms/";
const DEFAULT_TTL = 300;

/** Storage object path from a stored value (full URL or bare path). */
export function handoverPathFromUrl(value: string): string {
  const idx = value.indexOf(MARKER);
  const raw = idx >= 0 ? value.slice(idx + MARKER.length) : value;
  // Drop any token left over from a previously signed URL.
  return raw.split("?")[0];
}

/** Short-lived signed URL for one handover file. */
export async function getHandoverSignedUrl(
  urlOrPath: string,
  expiresIn = DEFAULT_TTL,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(handoverPathFromUrl(urlOrPath), expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Sign a batch of files in one round trip, preserving input order.
 * An entry that cannot be signed resolves to null so a single missing
 * attachment never blanks a whole gallery.
 */
export async function getHandoverSignedUrls(
  urlsOrPaths: string[],
  expiresIn = DEFAULT_TTL,
): Promise<(string | null)[]> {
  if (urlsOrPaths.length === 0) return [];
  const paths = urlsOrPaths.map(handoverPathFromUrl);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, expiresIn);
  if (error) return urlsOrPaths.map(() => null);

  const byPath = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
  }
  return paths.map((p) => byPath.get(p) ?? null);
}

/** Open a handover file in a new tab through a freshly-signed URL. */
export async function openHandoverFile(urlOrPath: string): Promise<void> {
  const url = await getHandoverSignedUrl(urlOrPath);
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Signed URLs for a media gallery, refreshed before they expire so a protocol
 * left open on screen keeps rendering.
 */
export function useHandoverSignedUrls(urlsOrPaths: string[]) {
  const key = urlsOrPaths.join("|");
  return useQuery({
    queryKey: ["handover-signed-urls", key],
    enabled: urlsOrPaths.length > 0,
    // Re-sign well inside the TTL.
    staleTime: (DEFAULT_TTL - 60) * 1000,
    refetchInterval: (DEFAULT_TTL - 60) * 1000,
    queryFn: () => getHandoverSignedUrls(urlsOrPaths),
  });
}
