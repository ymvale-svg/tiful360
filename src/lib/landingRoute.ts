import type { AppRole } from "@/hooks/useAuth";
import { hasDualAccess } from "@/lib/dualAccess";

export type Experience = "ops" | "portal";

const EXPERIENCE_KEY = "activeExperience";

/**
 * True on phones (not tablets/desktops). Prefers UA Client Hints; falls back to the
 * "Mobi" token, which phone browsers send and tablets (iPad, Android tablets) do not.
 */
export function isPhoneDevice(nav: Pick<Navigator, "userAgent"> & { userAgentData?: { mobile?: boolean } } =
  typeof navigator === "undefined" ? { userAgent: "" } : navigator): boolean {
  if (typeof nav.userAgentData?.mobile === "boolean") return nav.userAgentData.mobile;
  return /Mobi|iPhone|iPod|Windows Phone/i.test(nav.userAgent);
}

/** The experience chosen in this browser session, if any (via the in-app switch). */
export function storedExperience(): Experience | null {
  try {
    const v = sessionStorage.getItem(EXPERIENCE_KEY);
    return v === "ops" || v === "portal" ? v : null;
  } catch {
    return null;
  }
}

export function setStoredExperience(exp: Experience): void {
  try { sessionStorage.setItem(EXPERIENCE_KEY, exp); } catch { /* storage blocked: default applies */ }
}

/**
 * Which experience a user with both employee and ops roles lands in: an explicit choice
 * in this session wins; otherwise phones open the employee portal and computers open
 * the organisation system.
 */
export function landingExperience(isPhone = isPhoneDevice()): Experience {
  return storedExperience() ?? (isPhone ? "portal" : "ops");
}

const HOME_BY_ROLE: [AppRole, string][] = [
  ["super_admin", "/"],
  ["admin", "/"],
  ["payroll", "/leave-requests"],
  ["operations", "/employees"],
  ["it_manager", "/it-tickets"],
  ["direct_manager", "/leave-requests"],
];

/** First screen of the organisation system for the user's primary role. */
export function opsHomeRoute(roles: AppRole[]): string {
  return HOME_BY_ROLE.find(([r]) => roles.includes(r))?.[1] ?? "/";
}

/**
 * Where a signed-in user lands after choosing a company. Users with both experiences go
 * straight in (no picker): phone → portal, computer → organisation system. Everyone else
 * keeps their single natural home.
 */
export function landingRoute(roles: AppRole[], isPhone = isPhoneDevice()): string {
  if (hasDualAccess(roles)) {
    return landingExperience(isPhone) === "portal" ? "/portal" : opsHomeRoute(roles);
  }
  return HOME_BY_ROLE.find(([r]) => roles.includes(r))?.[1] ?? "/portal";
}
