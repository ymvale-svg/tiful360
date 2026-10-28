import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Search, Package, UserRound, FolderTree, Ticket, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAssets, useEmployees, useAssetCategories, useITTickets } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { getDomain, domainKeyToSlug } from "@/lib/assetDomains";
import { canSeeNavItem, navGroups } from "./AppSidebar";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  label: string;
  sub?: string;
  group: "pages" | "employees" | "assets" | "categories" | "tickets";
  to: string;
  icon?: typeof Search;
};

const GROUPS: { key: Hit["group"]; title: string; icon: typeof Search }[] = [
  { key: "pages", title: "מסכים", icon: CornerDownLeft },
  { key: "employees", title: "עובדים", icon: UserRound },
  { key: "assets", title: "פריטי ציוד", icon: Package },
  { key: "categories", title: "קטגוריות", icon: FolderTree },
  { key: "tickets", title: "קריאות שירות", icon: Ticket },
];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Header-wide search across screens, employees, assets, categories and service tickets, as a
 * command palette: Ctrl+K (⌘K) anywhere, arrows to move, Enter to open, Esc to close.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { roles, isSuperAdmin } = useAuth();

  // Only fetch the searchable lists once the palette is opened.
  const { data: assets, isLoading: la } = useAssets();
  const { data: employees, isLoading: le } = useEmployees();
  const { data: categories, isLoading: lc } = useAssetCategories();
  const { data: tickets, isLoading: lt } = useITTickets();
  const loading = la || le || lc || lt;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const slugFor = (categoryId?: string | null) => {
    const c = (categories ?? []).find((x: any) => x.id === categoryId);
    return domainKeyToSlug(getDomain(c as any));
  };

  const pages = useMemo<Hit[]>(() => navGroups.flatMap((g) => g.items)
    .filter((item) => canSeeNavItem(item, roles as any, isSuperAdmin))
    .map((item) => ({ id: item.path, label: item.label, group: "pages" as const, to: item.path, icon: item.icon })),
  [roles, isSuperAdmin]);

  const hits = useMemo<Hit[]>(() => {
    const q = term.trim().toLowerCase();
    const out: Hit[] = [];
    const pageHits = q ? pages.filter((p) => p.label.toLowerCase().includes(q)) : pages.slice(0, 6);
    out.push(...pageHits);
    if (q.length < 2) return out;

    for (const e of (employees ?? []) as any[]) {
      if (
        e.full_name?.toLowerCase().includes(q) ||
        e.employee_code?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.phone?.toLowerCase?.().includes(q)
      ) {
        out.push({
          id: e.id,
          label: e.full_name,
          sub: [e.employee_code, e.role].filter(Boolean).join(" · "),
          group: "employees",
          to: `/employees/${e.id}`,
        });
      }
      if (out.filter((h) => h.group === "employees").length >= 6) break;
    }

    for (const a of (assets ?? []) as any[]) {
      if (
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.license_plate?.toLowerCase?.().includes(q) ||
        (a.custom_fields && JSON.stringify(a.custom_fields).toLowerCase().includes(q))
      ) {
        out.push({
          id: a.id,
          label: a.asset_name,
          sub: [a.asset_code, a.serial_number].filter(Boolean).join(" · "),
          group: "assets",
          to: `/assets/${slugFor(a.category_id)}/${a.id}`,
        });
      }
      if (out.filter((h) => h.group === "assets").length >= 6) break;
    }

    for (const c of (categories ?? []) as any[]) {
      if (c.category_name?.toLowerCase().includes(q) || c.prefix?.toLowerCase?.().includes(q)) {
        out.push({
          id: c.id,
          label: c.category_name,
          sub: c.prefix ?? undefined,
          group: "categories",
          to: `/assets/${domainKeyToSlug(getDomain(c as any))}?cat=${c.id}`,
        });
      }
      if (out.filter((h) => h.group === "categories").length >= 4) break;
    }

    for (const t of (tickets ?? []) as any[]) {
      if (
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase?.().includes(q) ||
        t.employees?.full_name?.toLowerCase().includes(q)
      ) {
        out.push({
          id: t.id,
          label: t.title,
          sub: t.employees?.full_name ?? undefined,
          group: "tickets",
          to: `/it-tickets?selected=${t.id}`,
        });
      }
      if (out.filter((h) => h.group === "tickets").length >= 4) break;
    }

    return out;
  }, [term, pages, employees, assets, categories, tickets]);

  const go = (hit: Hit) => {
    setOpen(false);
    setTerm("");
    navigate(hit.to);
  };

  const q = term.trim();

  return (
    <>
      {/* Wide screens: a field-shaped trigger. Phones: an icon button, so search exists there too. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex w-56 lg:w-80 min-h-10 items-center gap-3 rounded-lg bg-muted px-3 text-sm text-muted-foreground hover:bg-muted/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="חיפוש עובדים, ציוד, קריאות ומסכים"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-right">חיפוש עובדים, ציוד, קריאות...</span>
        <kbd className="hidden lg:inline rounded border border-border bg-background px-1.5 font-mono text-[11px]" dir="ltr">{isMac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden grid h-11 w-11 place-items-center rounded-lg hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="חיפוש"
      >
        <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTerm(""); }}>
        <DialogContent className="top-[12%] translate-y-0 overflow-hidden p-0 shadow-2xl sm:max-w-xl" dir="rtl">
          <DialogTitle className="sr-only">חיפוש</DialogTitle>
          <DialogDescription className="sr-only">הקלידו לפחות שני תווים. חצים למעבר בין תוצאות, Enter לפתיחה.</DialogDescription>
          <CommandPrimitive shouldFilter={false} loop className="flex flex-col" label="חיפוש">
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <CommandPrimitive.Input
                value={term}
                onValueChange={setTerm}
                placeholder="חיפוש עובד, פריט, קריאה או מסך…"
                className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>
            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
              {q.length >= 2 && loading && (
                <CommandPrimitive.Loading>
                  <p className="px-3 py-3 text-sm text-muted-foreground">מחפש…</p>
                </CommandPrimitive.Loading>
              )}
              {!loading && (
                <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
                  לא נמצאו תוצאות עבור „{q}”
                </CommandPrimitive.Empty>
              )}
              {GROUPS.map(({ key, title, icon: GroupIcon }) => {
                const rows = hits.filter((h) => h.group === key);
                if (!rows.length) return null;
                return (
                  <CommandPrimitive.Group
                    key={key}
                    heading={q || key !== "pages" ? title : "מעבר מהיר"}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {rows.map((h) => {
                      const Icon = h.icon ?? GroupIcon;
                      return (
                        <CommandPrimitive.Item
                          key={`${key}-${h.id}`}
                          value={`${key}-${h.id}`}
                          onSelect={() => go(h)}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-right",
                            "data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{h.label}</span>
                            {h.sub && <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>}
                          </span>
                        </CommandPrimitive.Item>
                      );
                    })}
                  </CommandPrimitive.Group>
                );
              })}
            </CommandPrimitive.List>
            <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground" aria-hidden="true">
              <span><kbd className="font-mono">↑↓</kbd> מעבר</span>
              <span><kbd className="font-mono">Enter</kbd> פתיחה</span>
              <span><kbd className="font-mono">Esc</kbd> סגירה</span>
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}
