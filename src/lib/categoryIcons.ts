import {
  Boxes, Shield, FileText, Car, Laptop, Monitor, Smartphone, Key,
  CreditCard, Building2, Wrench, KeySquare, Package, Lock, Wifi,
  Printer, Fuel, Headphones, Camera, HardDrive, Server, Tablet,
  type LucideIcon,
} from "lucide-react";

export type CategoryColor = {
  bg: string;       // soft tinted background for the icon container
  text: string;     // icon color
  ring: string;     // hover ring color
};

// Tailwind palette tokens (work in light & dark)
const PALETTE: Record<string, CategoryColor> = {
  blue:    { bg: "bg-blue-500/15",    text: "text-blue-600 dark:text-blue-400",       ring: "hover:ring-blue-500/40" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-600 dark:text-emerald-400", ring: "hover:ring-emerald-500/40" },
  amber:   { bg: "bg-amber-500/15",   text: "text-amber-600 dark:text-amber-400",     ring: "hover:ring-amber-500/40" },
  rose:    { bg: "bg-rose-500/15",    text: "text-rose-600 dark:text-rose-400",       ring: "hover:ring-rose-500/40" },
  violet:  { bg: "bg-violet-500/15",  text: "text-violet-600 dark:text-violet-400",   ring: "hover:ring-violet-500/40" },
  cyan:    { bg: "bg-cyan-500/15",    text: "text-cyan-600 dark:text-cyan-400",       ring: "hover:ring-cyan-500/40" },
  orange:  { bg: "bg-orange-500/15",  text: "text-orange-600 dark:text-orange-400",   ring: "hover:ring-orange-500/40" },
  pink:    { bg: "bg-pink-500/15",    text: "text-pink-600 dark:text-pink-400",       ring: "hover:ring-pink-500/40" },
  indigo:  { bg: "bg-indigo-500/15",  text: "text-indigo-600 dark:text-indigo-400",   ring: "hover:ring-indigo-500/40" },
  teal:    { bg: "bg-teal-500/15",    text: "text-teal-600 dark:text-teal-400",       ring: "hover:ring-teal-500/40" },
  lime:    { bg: "bg-lime-500/15",    text: "text-lime-600 dark:text-lime-400",       ring: "hover:ring-lime-500/40" },
  fuchsia: { bg: "bg-fuchsia-500/15", text: "text-fuchsia-600 dark:text-fuchsia-400", ring: "hover:ring-fuchsia-500/40" },
};

const PALETTE_KEYS = Object.keys(PALETTE);

// Order matters — first match wins.
const ICON_MAP: Array<{ keywords: string[]; icon: LucideIcon; color: keyof typeof PALETTE }> = [
  { keywords: ["ביטוח", "insurance"], icon: Shield, color: "emerald" },
  { keywords: ["חוזה", "הסכם", "contract", "agreement"], icon: FileText, color: "amber" },
  { keywords: ["רכב", "car", "vehicle", "auto"], icon: Car, color: "orange" },
  { keywords: ["דלק", "fuel", "gas", "תדלוק"], icon: Fuel, color: "rose" },
  { keywords: ["לפטופ", "מחשב נייד", "laptop"], icon: Laptop, color: "blue" },
  { keywords: ["שרת", "server"], icon: Server, color: "indigo" },
  { keywords: ["דיסק", "storage", "drive"], icon: HardDrive, color: "violet" },
  { keywords: ["מחשב", "computer", "pc", "desktop"], icon: Monitor, color: "blue" },
  { keywords: ["מסך", "monitor", "screen"], icon: Monitor, color: "cyan" },
  { keywords: ["טאבלט", "tablet", "ipad"], icon: Tablet, color: "teal" },
  { keywords: ["טלפון", "נייד", "פלאפון", "phone", "mobile", "cell"], icon: Smartphone, color: "pink" },
  { keywords: ["אוזני", "headset", "headphone"], icon: Headphones, color: "fuchsia" },
  { keywords: ["מצלמ", "camera"], icon: Camera, color: "violet" },
  { keywords: ["מדפסת", "printer", "scanner"], icon: Printer, color: "indigo" },
  { keywords: ["רשת", "router", "switch", "network", "wifi"], icon: Wifi, color: "cyan" },
  { keywords: ["מפתח", "key"], icon: Key, color: "amber" },
  { keywords: ["כרטיס", "אשראי", "card", "credit"], icon: CreditCard, color: "lime" },
  { keywords: ["נדל", "בניין", "משרד", "מבנה", "building", "office", "property"], icon: Building2, color: "teal" },
  { keywords: ["כלי עבודה", "wrench", "tool", "tools"], icon: Wrench, color: "orange" },
  { keywords: ["תוכנה", "מנוי", "רישיון", "software", "subscription", "license", "saas"], icon: KeySquare, color: "violet" },
  { keywords: ["אבטחה", "security", "lock"], icon: Lock, color: "rose" },
  { keywords: ["מסמך", "מסמכים", "קבצים", "document", "file"], icon: FileText, color: "amber" },
  { keywords: ["ציוד", "equipment", "gear"], icon: Package, color: "blue" },
];

function findEntry(name: string | null | undefined) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return ICON_MAP.find((e) => e.keywords.some((k) => lower.includes(k.toLowerCase()))) ?? null;
}

function hashColor(name: string): CategoryColor {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const key = PALETTE_KEYS[Math.abs(h) % PALETTE_KEYS.length];
  return PALETTE[key];
}

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  return findEntry(name)?.icon ?? Boxes;
}

export function getCategoryColor(name: string | null | undefined): CategoryColor {
  const entry = findEntry(name);
  if (entry) return PALETTE[entry.color];
  if (!name) return PALETTE.blue;
  return hashColor(name);
}
