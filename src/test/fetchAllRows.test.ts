import { describe, it, expect } from "vitest";
import { fetchAllRows } from "@/lib/fetchAllRows";

const source = Array.from({ length: 1177 }, (_, i) => ({ n: i }));
const page = (from: number, to: number) =>
  Promise.resolve({ data: source.slice(from, Math.min(to, 999 + from) + 1), error: null });

describe("fetchAllRows", () => {
  it("returns every punch of a month with more than 1000 punches", async () => {
    const rows = await fetchAllRows(page);
    expect(rows).toHaveLength(1177);
    expect(rows[1176]).toEqual({ n: 1176 });
  });

  it("throws the backend error instead of returning a partial list", async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});
