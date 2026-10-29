import { beforeEach, describe, expect, it } from "vitest";
import { isPhoneDevice, landingRoute } from "@/lib/landingRoute";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

describe("isPhoneDevice", () => {
  it("detects phones but not tablets or computers", () => {
    expect(isPhoneDevice({ userAgent: IPHONE })).toBe(true);
    expect(isPhoneDevice({ userAgent: ANDROID_PHONE })).toBe(true);
    expect(isPhoneDevice({ userAgent: ANDROID_TABLET })).toBe(false);
    expect(isPhoneDevice({ userAgent: DESKTOP })).toBe(false);
  });

  it("prefers client hints when present", () => {
    expect(isPhoneDevice({ userAgent: DESKTOP, userAgentData: { mobile: true } })).toBe(true);
    expect(isPhoneDevice({ userAgent: IPHONE, userAgentData: { mobile: false } })).toBe(false);
  });
});

describe("landingRoute", () => {
  beforeEach(() => sessionStorage.clear());

  it("sends dual-access users to the organisation system on a computer", () => {
    expect(landingRoute(["employee", "admin"], false)).toBe("/");
    expect(landingRoute(["employee", "payroll"], false)).toBe("/leave-requests");
  });

  it("sends dual-access users to the portal on a phone", () => {
    expect(landingRoute(["employee", "admin"], true)).toBe("/portal");
  });

  it("honours an experience switched to in this session", () => {
    sessionStorage.setItem("activeExperience", "ops");
    expect(landingRoute(["employee", "hr"], true)).toBe("/");
    sessionStorage.setItem("activeExperience", "portal");
    expect(landingRoute(["employee", "admin"], false)).toBe("/portal");
  });

  it("sends employees without system access to the portal on any device", () => {
    expect(landingRoute(["employee"], false)).toBe("/portal");
    expect(landingRoute(["employee"], true)).toBe("/portal");
  });

  it("keeps ops-only users in the organisation system", () => {
    expect(landingRoute(["it_manager"], true)).toBe("/it-tickets");
  });
});
