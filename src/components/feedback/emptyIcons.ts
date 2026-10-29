import {
  Bell, CalendarClock, CheckCheck, ClipboardList, Filter, IdCard, KeyRound, LifeBuoy, MessageSquare,
  Package, PackageCheck, SearchX, ShieldCheck, Tag, UserPlus, Users, Wrench, type LucideIcon,
} from "lucide-react";

/** Icon trios for EmptyState's fanned cards, one per kind of empty list. */
export const EMPTY_ICONS = {
  noMatch: [Filter, SearchX, ClipboardList],
  employees: [IdCard, Users, UserPlus],
  onboarding: [KeyRound, ClipboardList, UserPlus],
  assets: [Tag, Package, KeyRound],
  allAssigned: [Users, PackageCheck, CheckCheck],
  tickets: [Wrench, LifeBuoy, MessageSquare],
  ticketsDone: [MessageSquare, CheckCheck, LifeBuoy],
  alerts: [CalendarClock, Bell, ShieldCheck],
} satisfies Record<string, LucideIcon[]>;
