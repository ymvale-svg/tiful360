import { useMemo, useState } from "react";
import { AlertTriangle, AppWindow, ExternalLink, Plus, Search, Star, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/feedback/IconButton";
import { EmptyState, StateView } from "@/components/feedback/StateView";
import { cn } from "@/lib/utils";
import { buildLauncherItems, filterLauncherItems, launcherCategories, type LauncherItem } from "@/lib/portalApps";
import { useCompanyPortalLinks, useLauncherFavorites, useMyAccessAssets, useToggleLauncherFavorite } from "@/hooks/usePortalApps";

interface Props {
  companyId: string | null | undefined;
  /** The signed-in user's employee card; without one only company-wide systems are shown. */
  employeeId: string | null | undefined;
  userId: string | null | undefined;
  /** The company or employee card is still loading: show a skeleton, never "no systems". */
  loading?: boolean;
  /** Opens a service ticket asking for access; the name is the system searched for, if any. */
  onRequestAccess?: (systemName?: string) => void;
}

const TILE = "flex min-h-28 flex-col gap-1.5 rounded-xl border border-border/60 bg-card p-3 text-start transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[.98] motion-reduce:active:scale-100 [touch-action:manipulation]";
const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))]";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
}

function AppTile({ item, favorite, onToggleFavorite }: { item: LauncherItem; favorite: boolean; onToggleFavorite: () => void }) {
  const warningText = item.warnings.map((w) => w.text).join(", ");
  return (
    <li className="relative">
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(TILE, "pe-11 text-foreground no-underline")}
        aria-label={[item.name, warningText, "נפתח בלשונית חדשה"].filter(Boolean).join(", ")}
      >
        <span aria-hidden="true" className={cn("grid h-10 w-10 place-items-center rounded-lg text-sm font-bold", favorite ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
          {initials(item.name)}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium leading-snug">
          <span className="line-clamp-2">{item.name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        {item.username && <span className="truncate text-xs text-muted-foreground" dir="auto">{item.username}</span>}
        {item.warnings.map((w) => (
          <span key={w.text} className={cn("flex items-center gap-1 text-xs font-medium", w.level === "critical" ? "text-destructive" : "text-amber-700 dark:text-amber-400")}>
            {w.level === "critical" ? <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {w.text}
          </span>
        ))}
      </a>
      <IconButton
        label={favorite ? `הסר מהמועדפים: ${item.name}` : `הוסף למועדפים: ${item.name}`}
        aria-pressed={favorite}
        className="absolute top-1.5 end-1.5"
        onClick={onToggleFavorite}
      >
        <Star className={cn("h-4 w-4", favorite ? "fill-warning text-amber-700 dark:text-amber-400" : "text-muted-foreground")} aria-hidden="true" />
      </IconButton>
    </li>
  );
}

/** "המערכות שלי": the company systems this employee may open, with search, categories and favourites. */
export function PortalAppLauncher({ companyId, employeeId, userId, loading = false, onRequestAccess }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const linksQuery = useCompanyPortalLinks(companyId);
  const assetsQuery = useMyAccessAssets(employeeId);
  const { data: favorites = new Set<string>() } = useLauncherFavorites(userId);
  const toggleFavorite = useToggleLauncherFavorite(userId);

  const items = useMemo(
    () => buildLauncherItems(linksQuery.data ?? [], assetsQuery.data ?? []),
    [linksQuery.data, assetsQuery.data],
  );
  const categories = useMemo(() => launcherCategories(items), [items]);
  const activeCategory = category && categories.includes(category) ? category : null;
  const shown = filterLauncherItems(items, query, activeCategory);
  const favoriteItems = shown.filter((i) => favorites.has(i.key));
  const otherItems = shown.filter((i) => !favorites.has(i.key));
  const filtering = !!query.trim() || !!activeCategory;

  const toggle = (item: LauncherItem) => {
    const favorite = !favorites.has(item.key);
    toggleFavorite.mutate(
      { key: item.key, favorite },
      { onError: () => toast.error(favorite ? "לא הצלחנו להוסיף למועדפים. נסו שוב." : "לא הצלחנו להסיר מהמועדפים. נסו שוב.") },
    );
  };

  const requestTile = onRequestAccess && (
    <li>
      <button
        type="button"
        onClick={() => onRequestAccess()}
        className={cn(TILE, "items-center justify-center border-dashed bg-transparent text-center text-sm font-medium text-primary")}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
        בקשת גישה למערכת
      </button>
    </li>
  );

  return (
    <section aria-labelledby="portal-apps-title" className="space-y-4 rounded-xl border border-border/50 bg-card p-4 lg:p-5">
      <div className="flex items-baseline gap-2">
        <h2 id="portal-apps-title" className="font-semibold lg:text-lg">המערכות שלי</h2>
        {linksQuery.isSuccess && items.length > 0 && <span className="text-sm text-muted-foreground">{items.length} מערכות</span>}
      </div>

      <StateView
        loading={loading || linksQuery.isLoading || assetsQuery.isLoading}
        error={linksQuery.error ?? assetsQuery.error}
        onRetry={() => { void linksQuery.refetch(); void assetsQuery.refetch(); }}
        label="את המערכות שלך"
        isEmpty={items.length === 0}
        empty={{
          icon: <AppWindow className="h-6 w-6" />,
          title: "עדיין לא הוגדרו לך מערכות",
          description: "מערכות שהוגדרו לך יופיעו כאן. צריך גישה למערכת? אפשר לבקש אותה בקריאת שירות.",
          action: onRequestAccess && (
            <Button variant="outline" className="gap-1.5" onClick={() => onRequestAccess()}>
              <Plus aria-hidden="true" /> בקשת גישה למערכת
            </Button>
          ),
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-[1_1_16rem]">
            <label htmlFor="portal-apps-search" className="sr-only">חיפוש מערכת</label>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="portal-apps-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && shown.length === 1) window.open(shown[0].url, "_blank", "noopener,noreferrer");
              }}
              placeholder="חיפוש מערכת…"
              className="h-11 ps-9"
              autoComplete="off"
            />
          </div>
          {categories.length > 1 && (
            <div role="group" aria-label="סינון לפי קטגוריה" className="flex flex-wrap gap-1.5">
              {[null, ...categories].map((c) => {
                const on = c === activeCategory;
                return (
                  <button
                    key={c ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(c)}
                    className={cn(
                      "min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    {c ?? "הכול"}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p role="status" aria-atomic="true" className="sr-only">
          {filtering ? (shown.length ? `נמצאו ${shown.length} מערכות` : "לא נמצאו מערכות") : ""}
        </p>

        {shown.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={query.trim() ? `לא מצאנו מערכת בשם "${query.trim()}"` : "אין מערכות בקטגוריה הזו"}
            description="ייתכן שעדיין אין לך גישה אליה. אפשר לבקש גישה, והבקשה תיפתח כקריאת שירות."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {onRequestAccess && (
                  <Button className="gap-1.5" onClick={() => onRequestAccess(query.trim() || undefined)}>
                    <Plus aria-hidden="true" /> בקשת גישה
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setQuery(""); setCategory(null); }}>ניקוי החיפוש</Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-4">
            {favoriteItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-warning text-amber-700 dark:text-amber-400" aria-hidden="true" />
                  מועדפים
                </h3>
                <ul className={GRID}>
                  {favoriteItems.map((item) => <AppTile key={item.key} item={item} favorite onToggleFavorite={() => toggle(item)} />)}
                </ul>
              </div>
            )}
            {(otherItems.length > 0 || !filtering) && (
              <div className="space-y-2">
                {favoriteItems.length > 0 && <h3 className="text-sm font-medium text-muted-foreground">כל המערכות</h3>}
                <ul className={GRID}>
                  {otherItems.map((item) => <AppTile key={item.key} item={item} favorite={false} onToggleFavorite={() => toggle(item)} />)}
                  {!filtering && requestTile}
                </ul>
              </div>
            )}
          </div>
        )}
      </StateView>
    </section>
  );
}
