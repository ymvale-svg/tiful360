/**
 * Free-text search for the open API, as a PostgREST or=(...) filter.
 *
 * The value goes inside or=(...), where a comma starts a new condition and parentheses
 * group them. If they reach the filter, the caller can add conditions of their own on any
 * column, including columns the API hides (omit), and use them as a yes/no oracle.
 * They are replaced with spaces; % and _ are escaped so they match literally.
 * (security-guard 2026-11-22, appsec:postgrest-or-injection-omit-bypass)
 */
export function searchOrFilter(cols: string[], search: string): string {
  const clean = search
    .replace(/[,()"\\]/g, " ")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_")
    .trim();
  return cols.map((c) => `${c}.ilike.%${clean}%`).join(",");
}
