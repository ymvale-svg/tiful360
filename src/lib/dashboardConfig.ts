import type { AppRole } from "@/hooks/useAuth";
import type { ProtocolDomain } from "@/hooks/useExpiringAssets";

export type KpiKey =
  | "activeEmployees"
  | "totalAssets"
  | "openAlerts"
  | "openTickets"
  | "onboardingEmployees";

export type WidgetKey =
  | "expiring"
  | "activity"
  | "onboarding"
  | "leave"
  | "alerts"
  | "leaving"
  | "attendanceMissing"
  | "tax101";

export interface DashboardConfig {
  kpis: KpiKey[];
  widgets: WidgetKey[];
  /** null = card hidden, "all" = every domain, otherwise the allowed domains. */
  expiryDomains: ProtocolDomain[] | "all" | null;
}

const ALL_DOMAINS = "all" as const;

const ROLE_CONFIG: Record<AppRole, DashboardConfig> = {
  super_admin: {
    kpis: ["activeEmployees", "totalAssets", "openAlerts", "openTickets"],
    widgets: ["expiring", "activity", "onboarding", "leave", "alerts", "leaving", "attendanceMissing", "tax101"],
    expiryDomains: ALL_DOMAINS,
  },
  admin: {
    kpis: ["activeEmployees", "totalAssets", "openAlerts", "openTickets"],
    widgets: ["expiring", "activity", "onboarding", "leave", "alerts", "leaving", "attendanceMissing", "tax101"],
    expiryDomains: ALL_DOMAINS,
  },
  operations: {
    kpis: ["activeEmployees", "totalAssets", "openAlerts", "openTickets"],
    widgets: ["expiring", "activity", "onboarding", "alerts", "leaving"],
    expiryDomains: ALL_DOMAINS,
  },
  it_manager: {
    kpis: ["totalAssets", "openTickets", "openAlerts"],
    widgets: ["expiring", "onboarding", "alerts", "activity"],
    expiryDomains: ["digital", "license", "physical"],
  },
  legal: {
    kpis: ["totalAssets"],
    widgets: ["expiring"],
    expiryDomains: ["insurance", "real_estate"],
  },
  finance: {
    kpis: ["totalAssets"],
    widgets: ["expiring"],
    expiryDomains: ["insurance", "license", "real_estate"],
  },
  hr: {
    kpis: ["activeEmployees", "onboardingEmployees"],
    widgets: ["onboarding", "leave", "leaving", "attendanceMissing", "activity"],
    expiryDomains: null,
  },
  payroll: {
    kpis: ["activeEmployees"],
    widgets: ["attendanceMissing", "leave", "tax101"],
    expiryDomains: null,
  },
  direct_manager: {
    kpis: ["activeEmployees"],
    widgets: ["leave", "attendanceMissing"],
    expiryDomains: null,
  },
  employee: {
    kpis: [],
    widgets: [],
    expiryDomains: null,
  },
};

const KPI_ORDER: KpiKey[] = [
  "activeEmployees",
  "onboardingEmployees",
  "totalAssets",
  "openAlerts",
  "openTickets",
];

const WIDGET_ORDER: WidgetKey[] = [
  "expiring",
  "activity",
  "onboarding",
  "leave",
  "attendanceMissing",
  "tax101",
  "alerts",
  "leaving",
];

/** Merges the configs of every role the user holds (union). */
export function resolveDashboardConfig(roles: AppRole[]): DashboardConfig {
  if (roles.includes("super_admin")) return ROLE_CONFIG.super_admin;

  const kpis = new Set<KpiKey>();
  const widgets = new Set<WidgetKey>();
  const domains = new Set<ProtocolDomain>();
  let allDomains = false;

  for (const role of roles) {
    const cfg = ROLE_CONFIG[role];
    if (!cfg) continue;
    cfg.kpis.forEach((k) => kpis.add(k));
    cfg.widgets.forEach((w) => widgets.add(w));
    if (cfg.expiryDomains === ALL_DOMAINS) allDomains = true;
    else if (Array.isArray(cfg.expiryDomains)) cfg.expiryDomains.forEach((d) => domains.add(d));
  }

  const expiryDomains: DashboardConfig["expiryDomains"] = allDomains
    ? ALL_DOMAINS
    : domains.size > 0
      ? Array.from(domains)
      : null;

  if (!expiryDomains) widgets.delete("expiring");

  return {
    kpis: KPI_ORDER.filter((k) => kpis.has(k)),
    widgets: WIDGET_ORDER.filter((w) => widgets.has(w)),
    expiryDomains,
  };
}
