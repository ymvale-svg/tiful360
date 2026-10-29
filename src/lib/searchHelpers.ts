export interface RecentHit {
  id: string;
  label: string;
  sub?: string;
  group: string;
  to: string;
}

const KEY = "tiful360:recent-search";
const MAX = 6;

const keyFor = (userId?: string | null) => (userId ? `${KEY}:${userId}` : KEY);

/** Items opened from search, newest first. Per user, per browser; empty when storage is blocked. */
export function readRecent(userId?: string | null): RecentHit[] {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    const list = raw ? (JSON.parse(raw) as RecentHit[]) : [];
    return Array.isArray(list) ? list.filter((h) => h && h.to && h.label).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function pushRecent(hit: RecentHit, userId?: string | null): RecentHit[] {
  const next = [hit, ...readRecent(userId).filter((h) => h.to !== hit.to)].slice(0, MAX);
  try { localStorage.setItem(keyFor(userId), JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

export function clearRecent(userId?: string | null) {
  try { localStorage.removeItem(keyFor(userId)); } catch { /* storage blocked */ }
}

/** Splits text around the first case-insensitive match of needle, for highlighting. */
export function splitMatch(text: string, needle: string): [string, string, string] | null {
  const q = needle.trim().toLowerCase();
  if (!q) return null;
  const i = text.toLowerCase().indexOf(q);
  return i < 0 ? null : [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}

function distance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/**
 * "Did you mean" for a query with no results: words from the searchable names that are close to
 * what was typed (a typo or two), best first.
 */
export function suggestTerms(query: string, names: readonly string[], limit = 3): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const allowed = q.length <= 4 ? 1 : 2;
  const scored = new Map<string, number>();
  for (const name of names) {
    for (const word of name.toLowerCase().split(/[\s\-_.·,/]+/)) {
      if (word.length < 2 || word === q) continue;
      const d = distance(q, word.slice(0, Math.max(q.length, Math.min(word.length, q.length + 1))));
      if (d <= allowed) scored.set(word, Math.min(scored.get(word) ?? Infinity, d));
    }
  }
  return [...scored.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([w]) => w);
}
