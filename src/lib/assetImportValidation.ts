/** One spreadsheet row of the asset import, after column mapping. */
export interface AssetImportRow {
  asset_code?: string;
  asset_name?: string;
  category_name?: string;
  serial_number?: string;
  status?: string;
  expiry_date?: string;
  notes?: string;
}

export interface AssetImportCheck {
  /** Problems that block importing this row; empty means the row is ready. */
  issues: string[];
  /** Resolved category id when the category name matched. */
  categoryId: string | null;
}

/**
 * Checks every row before anything is written, so the preview can show which rows will fail and
 * why (missing fields, unknown category, a code repeated in the file or already in the system).
 */
export function validateAssetImportRows(
  rows: AssetImportRow[],
  categories: { id: string; category_name: string }[],
  existingCodes: Iterable<string> = [],
): AssetImportCheck[] {
  const catMap = new Map(categories.map((c) => [c.category_name.trim().toLowerCase(), c.id]));
  const existing = new Set(Array.from(existingCodes, (c) => c.trim().toLowerCase()));
  const seen = new Map<string, number>();
  rows.forEach((r, i) => {
    const code = (r.asset_code ?? "").trim().toLowerCase();
    if (code && !seen.has(code)) seen.set(code, i);
  });

  return rows.map((r, i) => {
    const issues: string[] = [];
    const code = (r.asset_code ?? "").trim();
    if (!code) issues.push("חסר מזהה");
    if (!(r.asset_name ?? "").trim()) issues.push("חסר שם פריט");
    const catName = (r.category_name ?? "").trim();
    const categoryId = catName ? catMap.get(catName.toLowerCase()) ?? null : null;
    if (!catName) issues.push("חסרה קטגוריה");
    else if (!categoryId) issues.push(`הקטגוריה "${catName}" לא קיימת במערכת`);
    if (code) {
      const key = code.toLowerCase();
      if (seen.get(key) !== i) issues.push(`המזהה ${code} מופיע יותר מפעם אחת בקובץ`);
      else if (existing.has(key)) issues.push(`המזהה ${code} כבר קיים במערכת`);
    }
    return { issues, categoryId };
  });
}
