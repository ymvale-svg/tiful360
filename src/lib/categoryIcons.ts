import {
  Boxes, Shield, FileText, Car, Laptop, Monitor, Smartphone, Key,
  CreditCard, Building2, Wrench, KeySquare, Package, Lock, Wifi,
  Printer, Fuel, Headphones, Camera, HardDrive, Server, Tablet,
  type LucideIcon,
} from "lucide-react";

// Order matters — first match wins.
const ICON_MAP: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ["ביטוח", "insurance"], icon: Shield },
  { keywords: ["חוזה", "הסכם", "contract", "agreement"], icon: FileText },
  { keywords: ["רכב", "car", "vehicle", "auto"], icon: Car },
  { keywords: ["דלק", "fuel", "gas", "תדלוק"], icon: Fuel },
  { keywords: ["לפטופ", "מחשב נייד", "laptop"], icon: Laptop },
  { keywords: ["שרת", "server"], icon: Server },
  { keywords: ["דיסק", "storage", "drive"], icon: HardDrive },
  { keywords: ["מחשב", "computer", "pc", "desktop"], icon: Monitor },
  { keywords: ["מסך", "monitor", "screen"], icon: Monitor },
  { keywords: ["טאבלט", "tablet", "ipad"], icon: Tablet },
  { keywords: ["טלפון", "נייד", "פלאפון", "phone", "mobile", "cell"], icon: Smartphone },
  { keywords: ["אוזני", "headset", "headphone"], icon: Headphones },
  { keywords: ["מצלמ", "camera"], icon: Camera },
  { keywords: ["מדפסת", "printer", "scanner"], icon: Printer },
  { keywords: ["רשת", "router", "switch", "network", "wifi"], icon: Wifi },
  { keywords: ["מפתח", "key"], icon: Key },
  { keywords: ["כרטיס", "אשראי", "card", "credit"], icon: CreditCard },
  { keywords: ["נדל", "בניין", "משרד", "מבנה", "building", "office", "property"], icon: Building2 },
  { keywords: ["כלי עבודה", "wrench", "tool", "tools"], icon: Wrench },
  { keywords: ["תוכנה", "מנוי", "רישיון", "software", "subscription", "license", "saas"], icon: KeySquare },
  { keywords: ["אבטחה", "security", "lock"], icon: Lock },
  { keywords: ["מסמך", "מסמכים", "קבצים", "document", "file"], icon: FileText },
  { keywords: ["ציוד", "equipment", "gear"], icon: Package },
];

export function getCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Boxes;
  const lower = name.toLowerCase();
  for (const entry of ICON_MAP) {
    if (entry.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return entry.icon;
    }
  }
  return Boxes;
}
