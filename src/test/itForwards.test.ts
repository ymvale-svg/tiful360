import { describe, expect, it } from "vitest";
import { forwardedToIt } from "../../supabase/functions/_shared/it-forwards";

describe("forwardedToIt — a ticket Mesimon finished stays open when an IT person has it", () => {
  it("is true after a send to an IT person", () => {
    expect(forwardedToIt([{ at: "2026-11-10", by_name: "נווה", recipients: ["it@x"], sent: 1 }])).toBe(true);
  });
  it("is false when the ticket only went to Mesimon", () => {
    expect(forwardedToIt([{ target: "mesimon", at: "2026-11-10" }])).toBe(false);
  });
  it("is true when it went to Mesimon and also to an IT person", () => {
    expect(forwardedToIt([{ target: "mesimon" }, { by_name: "נווה", sent: 1 }])).toBe(true);
  });
  it.each([null, undefined, [], "x", [null]])("is false without forwards (%s)", (v) => {
    expect(forwardedToIt(v)).toBe(false);
  });
});
