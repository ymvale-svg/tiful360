// Pure rules for working an onboarding checklist: which items need an asset, which stock
// assets may be offered for an item, and which items may be removed.

export interface ChecklistItem {
  id: string;
  item_type: string;
  status: string;
  catalog_ref_id: string | null;
  selected_group_id: string | null;
  asset_id: string | null;
}

export interface StockAsset {
  id: string;
  asset_name: string;
  asset_code: string | null;
  category_id: string | null;
  group_id: string | null;
  current_owner_id: string | null;
  status: string;
  manufacturer_model?: string | null;
}

/** Item types whose completion hands over an asset (mirrors onboarding_item_needs_asset in the DB). */
export function itemNeedsAsset(itemType: string): boolean {
  return itemType === "asset" || itemType === "license" || itemType === "vehicle";
}

/** A done item records a hand-over: it is undone by unticking, never removed. */
export function canRemoveItem(item: Pick<ChecklistItem, "status">): boolean {
  return item.status !== "done";
}

/**
 * Assets that may be picked for an item: same category and sub-category, either in stock and
 * unowned or already held by this employee, and not reserved by another onboarding item.
 * Assets matching the preferred model come first.
 */
export function stockOptionsFor(
  item: Pick<ChecklistItem, "id" | "catalog_ref_id" | "selected_group_id" | "asset_id">,
  assets: StockAsset[],
  employeeId: string,
  reservedAssetIds: ReadonlySet<string>,
  preferredModel?: string | null,
): StockAsset[] {
  const model = preferredModel?.trim().toLowerCase() || null;
  const matchesModel = (a: StockAsset) =>
    !!model && (a.manufacturer_model ?? a.asset_name ?? "").toLowerCase().includes(model);

  return assets
    .filter((a) => {
      if (item.catalog_ref_id && a.category_id !== item.catalog_ref_id) return false;
      if (item.selected_group_id && a.group_id !== item.selected_group_id) return false;
      if (a.id === item.asset_id) return true;
      if (reservedAssetIds.has(a.id)) return false;
      if (a.current_owner_id === employeeId) return true;
      return !a.current_owner_id && a.status === "in_stock";
    })
    .sort((a, b) => Number(matchesModel(b)) - Number(matchesModel(a)));
}

/** Asset ids picked by pending items other than `exceptItemId`. */
export function reservedAssetIds(
  rows: Array<{ id: string; asset_id: string | null; status: string }>,
  exceptItemId?: string,
): Set<string> {
  return new Set(
    rows
      .filter((r) => r.asset_id && r.status !== "done" && r.id !== exceptItemId)
      .map((r) => r.asset_id as string),
  );
}
