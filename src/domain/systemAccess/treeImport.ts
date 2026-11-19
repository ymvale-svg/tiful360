// Parsing a folder-tree export (PowerShell Get-ChildItem → CSV, or plain lines) into paths
// relative to the drive or share root, and comparing it with the stored tree before importing.

export interface ParsedTree {
  /** Relative paths, segments joined by "\", unique and sorted. */
  paths: string[];
  /** The root that was stripped, e.g. "P:\" or "\\srv\share". Null when lines were already relative. */
  root: string | null;
  /** Lines that were not paths (headers, blanks). */
  skipped: number;
}

const DRIVE_ROOT = /^[A-Za-z]:\\/;
const UNC_ROOT = /^\\\\[^\\]+\\[^\\]+/;

/** One CSV field or plain line → a cleaned path with "\" separators, or null. */
function cleanLine(raw: string): string | null {
  let line = raw.replace(/^\uFEFF/, "").trim();
  if (!line || line.startsWith("#TYPE") || line.startsWith("#")) return null;
  // First CSV field (Export-Csv quotes every field; a path may contain commas inside quotes).
  if (line.startsWith('"')) {
    const end = line.indexOf('"', 1);
    line = end > 0 ? line.slice(1, end) : line.slice(1);
  }
  line = line.replace(/\//g, "\\").trim();
  if (!line || /^(fullname|path|name)$/i.test(line)) return null;
  return line;
}

function rootOf(path: string): string | null {
  const unc = path.match(UNC_ROOT);
  if (unc) return unc[0];
  const drive = path.match(DRIVE_ROOT);
  if (drive) return drive[0].slice(0, 2);
  return null;
}

/** Collapse repeated separators and trim each segment; empty segments are dropped. */
export function normalizeTreePath(path: string): string {
  return path
    .split("\\")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\\");
}

export function parseTreeExport(text: string): ParsedTree {
  const lines = text.split(/\r?\n/);
  const cleaned: string[] = [];
  let skipped = 0;
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (line === null) {
      if (raw.trim()) skipped++;
      continue;
    }
    cleaned.push(line);
  }

  // The root is the drive or share shared by the lines; lines under another root are skipped.
  const roots = new Map<string, number>();
  for (const l of cleaned) {
    const r = rootOf(l);
    if (r) roots.set(r.toLowerCase(), (roots.get(r.toLowerCase()) ?? 0) + 1);
  }
  const rootKey = [...roots.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const root = rootKey ? cleaned.find((l) => rootOf(l)?.toLowerCase() === rootKey)!.slice(0, rootKey.length) : null;

  const paths = new Set<string>();
  for (const l of cleaned) {
    const r = rootOf(l);
    if (rootKey && r?.toLowerCase() !== rootKey) {
      skipped++;
      continue;
    }
    const rel = normalizeTreePath(rootKey ? l.slice(rootKey.length) : l);
    if (rel) paths.add(rel);
  }
  return { paths: [...paths].sort((a, b) => a.localeCompare(b, "he")), root, skipped };
}

/** Every prefix of every path (the folders an import creates), e.g. "a\b" → ["a", "a\b"]. */
export function expandPrefixes(paths: string[]): Set<string> {
  const out = new Set<string>();
  for (const p of paths) {
    const segs = p.split("\\");
    for (let i = 1; i <= segs.length; i++) out.add(segs.slice(0, i).join("\\"));
  }
  return out;
}

/** What an import would change: new folders, and stored folders that are no longer there. */
export function diffTree(storedPaths: string[], importedPaths: string[]): { added: string[]; missing: string[] } {
  const stored = new Set(storedPaths);
  const imported = expandPrefixes(importedPaths);
  return {
    added: [...imported].filter((p) => !stored.has(p)).sort(),
    missing: storedPaths.filter((p) => !imported.has(p)).sort(),
  };
}

/** The PowerShell line IT runs on the file server to export a drive's folder tree. */
export function treeExportCommand(root: string) {
  const drive = root.trim() || "P:\\";
  return `Get-ChildItem -Path '${drive}' -Directory -Recurse -Depth 3 | Select-Object FullName | Export-Csv -Path tree.csv -NoTypeInformation -Encoding UTF8`;
}
