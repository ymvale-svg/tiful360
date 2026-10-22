import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { validateTicketFilter, visibleTicketId } from "@/lib/ticket-view-actions";
describe("OAuth return boundary", () => {
  it("preserves the full local authorization request", () => expect(oauthReturnPath("/.lovable/oauth/consent?authorization_id=abc#confirm")).toBe("/.lovable/oauth/consent?authorization_id=abc#confirm"));
  it("rejects external and malformed return paths", () => {
    for (const value of ["//outside.invalid", "/\\outside.invalid", "https://outside.invalid", "/\noutside", "/%2f/outside", null]) expect(oauthReturnPath(value)).toBe("/");
  });
});
describe("browser ticket boundaries", () => {
  it("rejects unknown filters without applying a change", () => expect(() => validateTicketFilter("closed" )).toThrow());
  it("accepts the UI closed-ticket filter", () => expect(validateTicketFilter("done")).toBe("done"));
  it("does not open a hidden ticket", () => expect(() => visibleTicketId("hidden", [{ id: "visible" }])).toThrow());
  it("opens a visible stable ID", () => expect(visibleTicketId("visible", [{ id: "visible" }])).toBe("visible"));
});