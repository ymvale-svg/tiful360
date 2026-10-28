/** Employee-portal navigation state, kept in the URL (?tab=…&view=…&kind=…) so the phone's Back button walks between tabs. */

export type PortalTab = "home" | "attendance" | "requests" | "knowledge" | "more";
export type PortalMoreView = "contacts" | "assets" | "pay" | "news";
export type PortalKnowledgeKind = "procedures" | "guides";

export interface PortalLocation {
  tab: PortalTab;
  /** Sub-page of "עוד"; null shows the "עוד" menu. */
  view: PortalMoreView | null;
  kind: PortalKnowledgeKind;
}

const TABS: PortalTab[] = ["home", "attendance", "requests", "knowledge", "more"];
const MORE_VIEWS: PortalMoreView[] = ["contacts", "assets", "pay", "news"];

/** Tab ids of the old 8-tile portal, so bookmarks and email links keep working. */
const LEGACY: Record<string, Partial<PortalLocation>> = {
  assets: { tab: "more", view: "assets" },
  contacts: { tab: "more", view: "contacts" },
  news: { tab: "more", view: "news" },
  hr: { tab: "more", view: "pay" },
  tickets: { tab: "requests" },
  kb: { tab: "knowledge", kind: "procedures" },
  guides: { tab: "knowledge", kind: "guides" },
};

export function resolvePortalLocation(params: URLSearchParams): PortalLocation {
  const rawTab = params.get("tab") ?? "";
  const rawView = params.get("view") ?? "";
  const rawKind = params.get("kind");
  const kind: PortalKnowledgeKind = rawKind === "guides" ? "guides" : "procedures";

  const legacy = LEGACY[rawTab];
  if (legacy) return { tab: legacy.tab!, view: legacy.view ?? null, kind: legacy.kind ?? kind };

  const tab: PortalTab = (TABS as string[]).includes(rawTab) ? (rawTab as PortalTab) : "home";
  const view = tab === "more" && (MORE_VIEWS as string[]).includes(rawView) ? (rawView as PortalMoreView) : null;
  return { tab, view, kind };
}

/**
 * The search params for a portal location. Params that belong to another screen (e.g. the
 * attendance `highlight` from the missing-punches email) are dropped when leaving that tab.
 */
export function portalLocationParams(current: URLSearchParams, next: Partial<PortalLocation> & { tab: PortalTab }): URLSearchParams {
  const out = new URLSearchParams();
  if (next.tab !== "home") out.set("tab", next.tab);
  if (next.tab === "more" && next.view) out.set("view", next.view);
  if (next.tab === "knowledge" && next.kind === "guides") out.set("kind", "guides");
  if (next.tab === "attendance" && current.get("highlight")) out.set("highlight", current.get("highlight")!);
  return out;
}
