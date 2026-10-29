import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command as CommandPrimitive } from "cmdk";
import { Search, Package, UserRound, FolderTree, Ticket, CornerDownLeft, History, X, SearchX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAssets, useEmployees, useAssetCategories, useITTickets } from "@/hooks/useData";
import { useAuth } from "@/hooks/useAuth";
import { getDomain, domainKeyToSlug } from "@/lib/assetDomains";
import { canSeeNavItem, navGroups } from "./AppSidebar";
import { cn } from "@/lib/utils";
import { clearRecent, pushRecent, readRecent, splitMatch, suggestTerms, type RecentHit } from "@/lib/searchHelpers";

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

/** Bold for the matched part of a result (after ephraimduncan's "Command Menu" on 21st.dev). */
function Highlight({ text, needle }: { text: string; needle: string }) {
  const parts = splitMatch(text, needle);
  if (!parts) return <>{text}</>;
  return <>{parts[0]}<mark className="bg-transparent font-semibold text-foreground">{parts[1]}</mark>{parts[2]}</>;
}

const itemCls = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-right data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground";
const headingCls = "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:justify-between [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground";

/**
 * Header-wide search across screens, employees, assets, categories and service tickets, as a
 * command palette: Ctrl+K (⌘K) anywhere, arrows to move, Enter to open, Esc to close.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { roles, isSuperAdmin, user } = useAuth();
  const [filter, setFilter] = useState<"all" | Hit["group"]>("all");
  const [recent, setRecent] = useState<RecentHit[]>([]);
  useEffect(() => { if (open) setRecent(readRecent(user?.id)); }, [open, user?.id]);

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

  const go = (hit: Hit | RecentHit) => {
    setRecent(pushRecent({ id: hit.id, label: hit.label, sub: hit.sub, group: hit.group, to: hit.to }, user?.id));
    setOpen(false);
    setTerm("");
    setFilter("all");
    navigate(hit.to);
  };

  const q = term.trim();
  const shown = filter === "all" ? hits : hits.filter((h) => h.group === filter);
  const counts = GROUPS.map((g) => ({ ...g, n: hits.filter((h) => h.group === g.key).length })).filter((g) => g.n > 0);
  const nothing = q.length >= 2 && !loading && hits.length === 0;
  const suggestions = useMemo(() => nothing
    ? suggestTerms(q, [...pages.map((p) => p.label), ...((employees ?? []) as any[]).map((e) => e.full_name ?? ""), ...((assets ?? []) as any[]).map((a) => a.asset_name ?? "")])
    : [], [nothing, q, pages, employees, assets]);
  const groupIcon = (g: string) => GROUPS.find((x) => x.key === g)?.icon ?? Search;

  return (
    <>
      {/* Wide screens: a field-shaped trigger. Phones: an icon button, so search exists there too. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex w-56 lg:w-80 min-h-10 items-center gap-3 rounded-lg border border-transparent bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setTerm(""); setFilter("all"); } }}>
        <DialogContent className="top-[10%] translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-2xl [&>button.absolute]:hidden" dir="rtl">
          <DialogTitle className="sr-only">חיפוש</DialogTitle>
          <DialogDescription className="sr-only">הקלידו לפחות שני תווים. חצים למעבר בין תוצאות, Enter לפתיחה.</DialogDescription>
          <CommandPrimitive shouldFilter={false} loop className="flex flex-col" label="חיפוש">
            <div className="flex h-16 items-center gap-3 border-b border-border px-5">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <CommandPrimitive.Input
                value={term}
                onValueChange={(v) => { setTerm(v); if (!v.trim()) setFilter("all"); }}
                placeholder="חיפוש עובד, פריט, קריאה או מסך…"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              {term && (
                <button type="button" onClick={() => { setTerm(""); setFilter("all"); }} className="min-h-9 shrink-0 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground">
                  נקה
                </button>
              )}
              <span aria-hidden="true" className="h-5 w-px bg-border" />
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירת החיפוש" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {q.length >= 2 && counts.length > 1 && (
              <div role="tablist" aria-label="סוג תוצאה" className="flex gap-1 overflow-x-auto border-b border-border px-4 py-2">
                {[{ key: "all" as const, title: "הכל", n: hits.length }, ...counts].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.key}
                    onClick={() => setFilter(f.key)}
                    className={cn("min-h-9 shrink-0 rounded-full px-3.5 text-sm transition-colors", filter === f.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
                  >
                    {f.title} <span className="tabular-nums opacity-70">{f.n}</span>
                  </button>
                ))}
              </div>
            )}

            <CommandPrimitive.List className="max-h-[60vh] overflow-y-auto p-2">
              {q.length >= 2 && loading && (
                <CommandPrimitive.Loading>
                  <p className="px-3 py-3 text-sm text-muted-foreground">מחפש…</p>
                </CommandPrimitive.Loading>
              )}

              {/* No query yet: what you opened lately, then quick jumps. */}
              {!q && recent.length > 0 && (
                <CommandPrimitive.Group heading="נפתחו לאחרונה" className={headingCls}>
                  {recent.map((h) => {
                    const Icon = groupIcon(h.group);
                    return (
                      <CommandPrimitive.Item key={`r-${h.to}`} value={`r-${h.to}`} onSelect={() => go(h)} className={itemCls}>
                        <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{h.label}</span>
                          {h.sub && <span className="block truncate text-xs text-muted-foreground">{h.sub}</span>}
                        </span>
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
                      </CommandPrimitive.Item>
                    );
                  })}
                  <button type="button" onClick={() => { clearRecent(user?.id); setRecent([]); }} className="mx-3 mb-1 min-h-8 text-xs text-muted-foreground hover:text-foreground">
                    ניקוי ההיסטוריה
                  </button>
                </CommandPrimitive.Group>
              )}

              {GROUPS.map(({ key, title, icon: GroupIcon }) => {
                const rows = shown.filter((h) => h.group === key);
                if (!rows.length) return null;
                return (
                  <CommandPrimitive.Group key={key} heading={q || key !== "pages" ? title : "מעבר מהיר"} className={headingCls}>
                    {rows.map((h) => {
                      const Icon = h.icon ?? GroupIcon;
                      return (
                        <CommandPrimitive.Item key={`${key}-${h.id}`} value={`${key}-${h.id}`} onSelect={() => go(h)} className={itemCls}>
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm"><Highlight text={h.label} needle={q} /></span>
                            {h.sub && <span className="block truncate text-xs text-muted-foreground"><Highlight text={h.sub} needle={q} /></span>}
                          </span>
                        </CommandPrimitive.Item>
                      );
                    })}
                  </CommandPrimitive.Group>
                );
              })}

              {/* Nothing found: echo the query, offer close names, a way out (after "Search Empty State" on 21st.dev). */}
              {nothing && (
                <div className="flex flex-col items-center gap-2 px-6 py-8 text-center" role="status">
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-border bg-muted/50 text-muted-foreground" aria-hidden="true">
                    <SearchX className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold">אין תוצאות</p>
                  <p className="max-w-[44ch] text-sm text-muted-foreground">
                    לא נמצא דבר עבור „<span className="font-medium text-foreground">{q}</span>”. נסו שם מלא, מספר עובד, מק״ט או מספר סידורי.
                  </p>
                  {suggestions.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
                      <span className="text-sm text-muted-foreground">אולי התכוונתם ל:</span>
                      {suggestions.map((s) => (
                        <button key={s} type="button" onClick={() => setTerm(s)} className="min-h-8 rounded-full border border-border px-3 text-sm text-foreground transition-colors hover:border-primary/50 hover:text-primary">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => setTerm("")} className="mt-2 min-h-9 rounded-md px-3 text-sm text-muted-foreground hover:text-foreground">
                    נקה חיפוש
                  </button>
                </div>
              )}
            </CommandPrimitive.List>
            <div className="flex items-center gap-4 border-t border-border bg-muted/30 px-5 py-2 text-xs text-muted-foreground" aria-hidden="true">
              <span><kbd className="rounded border border-border bg-background px-1 font-mono">↑↓</kbd> מעבר</span>
              <span><kbd className="rounded border border-border bg-background px-1 font-mono">Enter</kbd> פתיחה</span>
              <span><kbd className="rounded border border-border bg-background px-1 font-mono">Esc</kbd> סגירה</span>
            </div>
          </CommandPrimitive>
        </DialogContent>
      </Dialog>
    </>
  );
}
