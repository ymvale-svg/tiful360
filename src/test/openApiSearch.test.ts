import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchOrFilter } from "../../supabase/functions/_shared/openApiSearch";

const root = join(__dirname, "../..");

// security-guard 2026-11-22: tonight's findings on the open API.
describe("open-api — free-text search and the read log", () => {
  it("a search value cannot add conditions of its own to or=(...)", () => {
    const f = searchOrFilter(["full_name", "email"], "x%,offboarding_snapshot->>a.like.*b*),(id.neq.0");
    // Exactly one condition per allowed column, and no hidden column inside a condition of its own.
    expect(f.split(",")).toHaveLength(2);
    expect(f).not.toMatch(/[()]/);
    expect(f.startsWith("full_name.ilike.%x\\%")).toBe(true);
  });

  it("an ordinary search still matches on every search column", () => {
    expect(searchOrFilter(["full_name", "email"], "כהן")).toBe("full_name.ilike.%כהן%,email.ilike.%כהן%");
    expect(searchOrFilter(["full_name"], "a_b")).toBe("full_name.ilike.%a\\_b%");
  });

  it("open-api uses the safe filter, and a list read logs every id it returned", () => {
    const src = readFileSync(join(root, "supabase/functions/open-api/index.ts"), "utf8");
    expect(src).toContain("q = q.or(searchOrFilter(cols, search));");
    expect(src).not.toMatch(/ilike\.%\$\{clean\}%/);
    expect(src).toMatch(/log\.requested_ids = readIds;/);
  });
});
