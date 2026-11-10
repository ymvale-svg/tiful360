// Breaking access groups down into the resources they open, for IT's protocol and for audits.

export type AccessLevel = "read" | "write";

export interface ProtocolGroup {
  name: string;
  external_name: string | null;
  resources: Array<{ path: string; level: AccessLevel }>;
}

export interface ProtocolRow {
  group: string;
  externalName: string | null;
  path: string;
  level: AccessLevel;
}

export const LEVEL_LABEL: Record<AccessLevel, string> = { read: "קריאה בלבד", write: "קריאה וכתיבה" };

/** One row per group × resource, groups in the given order, resources by path. */
export function buildGroupProtocol(groups: ProtocolGroup[]): ProtocolRow[] {
  return groups.flatMap((g) =>
    [...g.resources]
      .sort((a, b) => a.path.localeCompare(b.path, "he"))
      .map((r) => ({ group: g.name, externalName: g.external_name, path: r.path, level: r.level })),
  );
}

/** The access a set of groups gives in total: per resource, write wins over read. */
export function effectiveAccess(groups: ProtocolGroup[]): Map<string, AccessLevel> {
  const out = new Map<string, AccessLevel>();
  for (const g of groups) {
    for (const r of g.resources) {
      if (out.get(r.path) !== "write") out.set(r.path, r.level);
    }
  }
  return out;
}
