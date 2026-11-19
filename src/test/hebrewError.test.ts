import { describe, it, expect } from "vitest";
import { toHebrewError } from "@/lib/hebrewError";

describe("toHebrewError", () => {
  it("translates duplicate ID number", () => {
    expect(toHebrewError('duplicate key value violates unique constraint "employees_id_number_key"')).toContain("תעודת הזהות");
  });
  it("keeps Hebrew messages", () => {
    expect(toHebrewError("יש לבחור תאריך")).toBe("יש לבחור תאריך");
  });
  it("never returns English", () => {
    expect(toHebrewError("Something weird happened")).toMatch(/[\u0590-\u05FF]/);
  });
});
