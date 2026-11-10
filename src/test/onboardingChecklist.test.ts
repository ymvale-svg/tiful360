import { describe, expect, it, vi } from "vitest";
import {
  canRemoveItem,
  itemNeedsAsset,
  reservedAssetIds,
  stockOptionsFor,
  type StockAsset,
} from "@/domain/onboarding/checklist";
import { completeOnboardingItem, listOnboardingAssetPicks } from "@/services/onboarding";

type Db = Parameters<typeof completeOnboardingItem>[0];
const db = (fake: object) => fake as unknown as Db;

const EMP = "emp-1";
const asset = (id: string, patch: Partial<StockAsset> = {}): StockAsset => ({
  id,
  asset_name: id,
  asset_code: id.toUpperCase(),
  category_id: "cat-laptop",
  group_id: "grp-dell",
  current_owner_id: null,
  status: "in_stock",
  ...patch,
});
const item = { id: "item-1", catalog_ref_id: "cat-laptop", selected_group_id: "grp-dell", asset_id: null };
const ids = (xs: StockAsset[]) => xs.map((a) => a.id);

describe("stock options for a checklist item", () => {
  it("offers only in-stock unowned assets of the same category and sub-category", () => {
    const assets = [
      asset("free"),
      asset("repair", { status: "in_repair" }),
      asset("lost", { status: "lost" }),
      asset("someone-else", { current_owner_id: "emp-2", status: "in_use" }),
      asset("other-category", { category_id: "cat-phone" }),
      asset("other-group", { group_id: "grp-lenovo" }),
    ];
    expect(ids(stockOptionsFor(item, assets, EMP, new Set()))).toEqual(["free"]);
  });

  it("offers an asset the employee already holds", () => {
    const assets = [asset("theirs", { current_owner_id: EMP, status: "in_use" })];
    expect(ids(stockOptionsFor(item, assets, EMP, new Set()))).toEqual(["theirs"]);
  });

  it("hides assets reserved by another onboarding item but keeps the item's own pick", () => {
    const assets = [asset("taken"), asset("mine"), asset("free")];
    const picks = [
      { id: "other-item", asset_id: "taken", status: "pending" },
      { id: "item-1", asset_id: "mine", status: "pending" },
    ];
    const options = stockOptionsFor({ ...item, asset_id: "mine" }, assets, EMP, reservedAssetIds(picks, "item-1"));
    expect(ids(options)).toEqual(["mine", "free"]);
  });

  it("lists the preferred model first", () => {
    const assets = [
      asset("lenovo", { manufacturer_model: "Lenovo T14" }),
      asset("dell", { manufacturer_model: "Dell Latitude 5450" }),
    ];
    expect(ids(stockOptionsFor(item, assets, EMP, new Set(), "latitude 5450"))).toEqual(["dell", "lenovo"]);
  });
});

describe("checklist item rules", () => {
  it("requires an asset only for equipment and licence items", () => {
    expect(itemNeedsAsset("asset")).toBe(true);
    expect(itemNeedsAsset("license")).toBe(true);
    expect(itemNeedsAsset("task")).toBe(false);
    expect(itemNeedsAsset("access")).toBe(false);
  });

  it("never removes a done item", () => {
    expect(canRemoveItem({ status: "done" })).toBe(false);
    expect(canRemoveItem({ status: "pending" })).toBe(true);
  });

  it("ignores done picks when reserving assets", () => {
    const picks = [
      { id: "a", asset_id: "x", status: "done" },
      { id: "b", asset_id: "y", status: "pending" },
      { id: "c", asset_id: null, status: "pending" },
    ];
    expect([...reservedAssetIds(picks)]).toEqual(["y"]);
  });
});

describe("onboarding service", () => {
  it("ticks through the atomic DB function with a trimmed note", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "item-1" }, error: null });
    await completeOnboardingItem(db({ rpc }), "item-1", true, "  נפתח תיק  ");
    expect(rpc).toHaveBeenCalledWith("complete_onboarding_item", { _item_id: "item-1", _done: true, _note: "נפתח תיק" });
  });

  it("sends no note when it is blank, and throws the DB error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("asset is not in stock") });
    await expect(completeOnboardingItem(db({ rpc }), "item-1", true, "   ")).rejects.toThrow("asset is not in stock");
    expect(rpc).toHaveBeenCalledWith("complete_onboarding_item", { _item_id: "item-1", _done: true, _note: null });
  });

  it("reads only items that hold an asset", async () => {
    const not = vi.fn().mockResolvedValue({ data: [{ id: "a", asset_id: "x", status: "pending" }], error: null });
    const select = vi.fn(() => ({ not }));
    const from = vi.fn(() => ({ select }));
    await expect(listOnboardingAssetPicks(db({ from }))).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith("onboarding_items");
    expect(not).toHaveBeenCalledWith("asset_id", "is", null);
  });
});
