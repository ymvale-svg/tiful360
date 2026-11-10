import { describe, expect, it } from "vitest";
import { validateAssetImportRows } from "@/lib/assetImportValidation";

const cats = [{ id: "c1", category_name: "מחשבים" }, { id: "c2", category_name: "Phones" }];

describe("validateAssetImportRows", () => {
  it("accepts a complete row and resolves its category case-insensitively", () => {
    const [check] = validateAssetImportRows([{ asset_code: "IT-1", asset_name: "Dell", category_name: " phones " }], cats);
    expect(check).toEqual({ issues: [], categoryId: "c2" });
  });

  it("reports missing fields and unknown categories before importing", () => {
    const [a, b] = validateAssetImportRows([
      { asset_name: "ללא קוד" },
      { asset_code: "X-1", asset_name: "פריט", category_name: "לא קיימת" },
    ], cats);
    expect(a.issues).toEqual(["חסר מזהה", "חסרה קטגוריה"]);
    expect(b.issues).toEqual(['הקטגוריה "לא קיימת" לא קיימת במערכת']);
    expect(b.categoryId).toBeNull();
  });

  it("flags codes repeated in the file (after the first) and codes already in the system", () => {
    const checks = validateAssetImportRows([
      { asset_code: "A-1", asset_name: "1", category_name: "מחשבים" },
      { asset_code: "a-1", asset_name: "2", category_name: "מחשבים" },
      { asset_code: "B-2", asset_name: "3", category_name: "מחשבים" },
    ], cats, ["b-2"]);
    expect(checks[0].issues).toEqual([]);
    expect(checks[1].issues).toEqual(["המזהה a-1 מופיע יותר מפעם אחת בקובץ"]);
    expect(checks[2].issues).toEqual(["המזהה B-2 כבר קיים במערכת"]);
  });
});
