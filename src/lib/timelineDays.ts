/** Local calendar day: timestamps are UTC, so slicing them would misplace events near midnight. */
export function dayKey(at: string): string {
  if (at.length <= 10) return at;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "היום", "אתמול", or the date, for a YYYY-MM-DD key. */
export function dayLabel(key: string, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = key.split("-").map(Number);
  const diff = Math.round((today.getTime() - new Date(y, m - 1, d).getTime()) / 86_400_000);
  if (diff === 0) return "היום";
  if (diff === 1) return "אתמול";
  return new Date(y, m - 1, d).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });
}

/** Items in the order given, split into consecutive days. */
export function groupByDay<T extends { at: string }>(items: readonly T[]) {
  const groups: { key: string; items: T[] }[] = [];
  for (const item of items) {
    const key = dayKey(item.at ?? "");
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}
