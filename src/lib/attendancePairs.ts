/**
 * זיווג החתמות של יום עבודה: כל כניסה נסגרת ביציאה שאחריה.
 * עובד שיוצא באמצע היום וחוזר מקבל כמה זוגות, והשעות הן סכום הזוגות בלבד —
 * זמן היציאה (הפסקה, קופת חולים) לא נספר כשעות עבודה.
 */
export interface PairablePunch {
  id: string;
  punch_at: string;
  direction: string;
  status?: string | null;
}

export interface PunchPair<P extends PairablePunch> {
  in: P | null;
  out: P | null;
}

export interface DayPairs<P extends PairablePunch> {
  pairs: PunchPair<P>[];
  /** דקות עבודה — סכום הזוגות השלמים בלבד */
  workedMinutes: number;
  /** דקות בין יציאה לחזרה בין זוגות שלמים */
  breakMinutes: number;
  /** חסרה כניסה או יציאה באחד הזוגות */
  hasGap: boolean;
}

/** משמרת ארוכה מזה אינה נחשבת זוג אחד (כמו בדוח המיקומים). */
export const MAX_SHIFT_HOURS = 20;

const ms = (p: PairablePunch) => new Date(p.punch_at).getTime();

export function pairDayPunches<P extends PairablePunch>(punches: P[]): DayPairs<P> {
  const list = punches
    .filter((p) => p.status !== "rejected")
    .slice()
    .sort((a, b) => a.punch_at.localeCompare(b.punch_at));
  const pairs: PunchPair<P>[] = [];
  let open: P | null = null;
  for (const p of list) {
    // כיוון לא ידוע נקבע לפי הסדר: אחרי כניסה פתוחה — יציאה, אחרת כניסה.
    const dir = p.direction === "in" || p.direction === "out" ? p.direction : open ? "out" : "in";
    if (dir === "in") {
      if (open) pairs.push({ in: open, out: null });
      open = p;
    } else if (open) {
      pairs.push({ in: open, out: p });
      open = null;
    } else {
      pairs.push({ in: null, out: p });
    }
  }
  if (open) pairs.push({ in: open, out: null });

  let worked = 0;
  for (const pr of pairs) {
    if (pr.in && pr.out) {
      const d = ms(pr.out) - ms(pr.in);
      if (d > 0) worked += d;
    }
  }
  let breaks = 0;
  for (let i = 1; i < pairs.length; i++) {
    const prevOut = pairs[i - 1].out;
    const nextIn = pairs[i].in;
    if (prevOut && nextIn && pairs[i - 1].in && pairs[i].out) {
      const d = ms(nextIn) - ms(prevOut);
      if (d > 0) breaks += d;
    }
  }
  return {
    pairs,
    workedMinutes: Math.round(worked / 60000),
    breakMinutes: Math.round(breaks / 60000),
    hasGap: pairs.some((p) => !p.in || !p.out),
  };
}

/** YYYY-MM-DD בשעון המקומי */
export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * מקבץ החתמות לפי יום עבודה. משמרת שעוברת את חצות נספרת ליום הכניסה:
 * יציאה שבאה מיד אחרי כניסה מהיום הקודם (עד 20 שעות) משויכת ליום הכניסה.
 */
export function groupPunchesByWorkDay<P extends PairablePunch>(
  punches: P[],
  keyOf: (iso: string) => string = localDayKey,
): Map<string, P[]> {
  const sorted = punches
    .filter((p) => p.status !== "rejected")
    .slice()
    .sort((a, b) => a.punch_at.localeCompare(b.punch_at));
  const map = new Map<string, P[]>();
  let prev: { p: P; key: string } | null = null;
  for (const p of sorted) {
    let key = keyOf(p.punch_at);
    if (
      prev && prev.key !== key && p.direction === "out" && prev.p.direction === "in" &&
      ms(p) - ms(prev.p) <= MAX_SHIFT_HOURS * 3600000 &&
      // רק כשהכניסה הייתה ההחתמה האחרונה ביום שלה (אין זוג פתוח אחר)
      (map.get(prev.key)?.[map.get(prev.key)!.length - 1]?.id === prev.p.id)
    ) {
      key = prev.key;
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
    prev = { p, key };
  }
  return map;
}

/** 450 → "7.5" */
export function minutesToHours(min: number): string {
  return (min / 60).toFixed(1);
}

/** 80 → "1:20" */
export function minutesToHM(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}
