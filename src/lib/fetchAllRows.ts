/**
 * The backend returns at most 1000 rows per request, silently. Reads that can
 * exceed that (a month of company-wide punches, for example) must go through
 * this helper so later rows are never dropped from reports or exports.
 * The page callback must use a stable order (e.g. punch_at + id).
 */
export const ROWS_PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = ROWS_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
