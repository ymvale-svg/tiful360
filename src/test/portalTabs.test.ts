import { describe, expect, it } from "vitest";
import { portalLocationParams, resolvePortalLocation } from "@/components/portal/portalTabs";

const p = (q: string) => new URLSearchParams(q);

describe("employee portal tab URL state", () => {
  it("defaults to home", () => expect(resolvePortalLocation(p(""))).toEqual({ tab: "home", view: null, kind: "procedures" }));
  it("rejects unknown tabs and views", () => {
    expect(resolvePortalLocation(p("tab=evil")).tab).toBe("home");
    expect(resolvePortalLocation(p("tab=more&view=evil")).view).toBeNull();
    expect(resolvePortalLocation(p("tab=home&view=assets")).view).toBeNull();
  });
  it("keeps the attendance deep link from the missing-punches email", () => {
    expect(resolvePortalLocation(p("tab=attendance&highlight=2026-05-12")).tab).toBe("attendance");
    expect(portalLocationParams(p("tab=attendance&highlight=2026-05-12"), { tab: "attendance" }).toString()).toBe("tab=attendance&highlight=2026-05-12");
    expect(portalLocationParams(p("tab=attendance&highlight=2026-05-12"), { tab: "home" }).toString()).toBe("");
  });
  it("maps the old tile ids into the new tabs", () => {
    expect(resolvePortalLocation(p("tab=assets"))).toMatchObject({ tab: "more", view: "assets" });
    expect(resolvePortalLocation(p("tab=hr"))).toMatchObject({ tab: "more", view: "pay" });
    expect(resolvePortalLocation(p("tab=tickets")).tab).toBe("requests");
    expect(resolvePortalLocation(p("tab=guides"))).toMatchObject({ tab: "knowledge", kind: "guides" });
    expect(resolvePortalLocation(p("tab=kb"))).toMatchObject({ tab: "knowledge", kind: "procedures" });
  });
  it("writes only the params a location needs", () => {
    expect(portalLocationParams(p(""), { tab: "more", view: "contacts" }).toString()).toBe("tab=more&view=contacts");
    expect(portalLocationParams(p(""), { tab: "knowledge", kind: "guides" }).toString()).toBe("tab=knowledge&kind=guides");
    expect(portalLocationParams(p("tab=more&view=pay"), { tab: "requests" }).toString()).toBe("tab=requests");
  });
});
