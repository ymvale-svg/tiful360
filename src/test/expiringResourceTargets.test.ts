import { describe, expect, it } from "vitest";
import type { ExpiringAsset } from "@/hooks/useExpiringAssets";
import { expiryClickAction, getExpiringResourceTargets } from "@/lib/expiringResourceTargets";

const item: ExpiringAsset = {
  asset_id: "resource-1", asset_name: "משאב", asset_code: "A1", category_id: "category-1",
  category_name: "קטגוריה", category_prefix: "", is_assignable: false, source_type: "asset",
  source_id: "resource-1", field_key: null, field_label: "תוקף", expiry_date: "2026-11-01",
  days_left: 10, current_owner_id: null, owner_name: null, custom_fields: null,
  domain: "real_estate", expiry_type: "expiry", assignee_role: "operations",
};

describe("expiry resource opening", () => {
  it("opens the single relevant resource directly", () => {
    expect(expiryClickAction(getExpiringResourceTargets([item], []))).toEqual({ type: "navigate", href: "/assets/real-estate/resource-1" });
  });
  it("opens a list with a direct destination for each resource when there are several", () => {
    const targets = getExpiringResourceTargets([item, { ...item, asset_id: "resource-2" }], []);
    expect(expiryClickAction(targets)).toEqual({ type: "list" });
    expect(targets.map((target) => target.href)).toEqual(["/assets/real-estate/resource-1", "/assets/real-estate/resource-2"]);
  });
  it("groups multiple expiry records of one resource without losing their dates", () => {
    const targets = getExpiringResourceTargets([item, { ...item, source_type: "document", source_id: "document-1", expiry_date: "2026-11-02" }], []);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.expiries.map((e) => e.expiry_date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(expiryClickAction(targets)).toEqual({ type: "navigate", href: "/assets/real-estate/resource-1" });
  });
  it("uses the category domain and parent asset ID for a document", () => {
    const targets = getExpiringResourceTargets([{ ...item, source_type: "document", source_id: "doc" }], [{ id: "category-1", domain: "insurance" }]);
    expect(targets[0]?.href).toBe("/assets/insurance/resource-1");
  });
  it("maps vehicle and license protocol names to valid domain slugs", () => {
    expect(getExpiringResourceTargets([{ ...item, domain: "vehicle" }], [])[0]?.href).toBe("/assets/physical/resource-1");
    expect(getExpiringResourceTargets([{ ...item, domain: "license" }], [])[0]?.href).toBe("/assets/licenses/resource-1");
  });
  it("does not navigate to an invalid asset when a standalone access has no owner", () => {
    const targets = getExpiringResourceTargets([{ ...item, asset_id: "", source_type: "digital_access" }], []);
    expect(targets[0]?.href).toBeNull();
    expect(expiryClickAction(targets)).toEqual({ type: "list" });
  });
});