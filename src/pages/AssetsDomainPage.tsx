import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Search, Plus, ArrowRight, Users, AlertTriangle, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { AssetDetailView } from "@/components/assets/AssetDetailView";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import {
  DOMAIN_META,
  getDomain,
  domainSlugToKey,
  getGroupKey,
  type DomainKey,
} from "@/lib/assetDomains";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש",
  in_stock: "במלאי",
  in_repair: "בתיקון",
  lost: "אבד",
};
const assetStatusClasses: Record<string, string> = {
  in_use: "status-active",
  in_stock: "status-onboarding",
  in_repair: "status-leaving",
  lost: "status-inactive",
};

type SortMode = "count" | "alpha" | "expiry";

function expiryOf(a: any, domain: DomainKey): string | null {
  if (domain === "digital") return a.license_expires_at || a.password_expires_at || null;
  if (domain === "licenses") return a.license_expires_at || null;
  return a.expiry_date || null;
}

export default function AssetsDomainPage() {
  const params = useParams<{ domain: string; itemId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: groups } = useAssetGroups();
  const { data: expiring } = useExpiringAssets(30);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);

  const domainKey = domainSlugToKey(params.domain);
  if (!domainKey) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-muted-foreground mb-4">דומיין לא קיים: {params.domain}</p>
        <Button onClick={() => navigate("/assets")}>חזרה למסך משאבים</Button>
      </div>
    );
  }
  const domain: DomainKey = domainKey;
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;
  const subParam = searchParams.get("sub");
  const groupParam = searchParams.get("group");

  const domainCats = useMemo(
    () => (categories ?? []).filter((c: any) => getDomain(c) === domain),
    [categories, domain],
  );
  const catById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of domainCats) m.set(c.id, c);
    return m;
  }, [domainCats]);
  const catIds = useMemo(() => new Set(domainCats.map((c: any) => c.id)), [domainCats]);

  const groupsById = useMemo(() => {
    const m = new Map<string, { name: string }>();
    for (const g of groups ?? []) m.set(g.id, { name: g.name });
    return m;
  }, [groups]);

  const domainAssets = useMemo(
    () => (assets ?? []).filter((a: any) => catIds.has(a.category_id)),
    [assets, catIds],
  );

  // Apply sub-category filter + search to the asset pool
  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return domainAssets.filter((a: any) => {
      if (subParam && a.category_id !== subParam) return false;
      if (!q) return true;
      const groupName = getGroupKey(a, domain, catById.get(a.category_id), groupsById) ?? "";
      return (
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.employees?.full_name?.toLowerCase().includes(q) ||
        groupName.toLowerCase().includes(q)
      );
    });
  }, [domainAssets, search, subParam, domain, catById, groupsById]);

  // Build parent groups per (category, group-key)
  const parentGroups = useMemo(() => {
    const map = new Map<string, { category: any; groupKey: string | null; items: any[] }>();
    for (const a of visibleAssets) {
      const cat = catById.get(a.category_id);
      if (!cat) continue;
      const key = getGroupKey(a, domain, cat, groupsById);
      const mapKey = `${cat.id}::${key ?? "__flat__"}`;
      if (!map.has(mapKey)) map.set(mapKey, { category: cat, groupKey: key, items: [] });
      map.get(mapKey)!.items.push(a);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      if (sortMode === "alpha") {
        const an = a.groupKey ?? a.category.category_name;
        const bn = b.groupKey ?? b.category.category_name;
        return an.localeCompare(bn, "he");
      }
      if (sortMode === "expiry") {
        const minA = a.items.reduce<number>((acc, it) => {
          const e = expiryOf(it, domain);
          if (!e) return acc;
          const t = new Date(e).getTime();
          return t < acc ? t : acc;
        }, Number.POSITIVE_INFINITY);
        const minB = b.items.reduce<number>((acc, it) => {
          const e = expiryOf(it, domain);
          if (!e) return acc;
          const t = new Date(e).getTime();
          return t < acc ? t : acc;
        }, Number.POSITIVE_INFINITY);
        return minA - minB;
      }
      // count desc, then alpha
      if (b.items.length !== a.items.length) return b.items.length - a.items.length;
      const an = a.groupKey ?? a.category.category_name;
      const bn = b.groupKey ?? b.category.category_name;
      return an.localeCompare(bn, "he");
    });
    return arr;
  }, [visibleAssets, catById, domain, sortMode, groupsById]);

  // Currently-drilled group items
  const drilledItems = useMemo(() => {
    if (!subParam || groupParam === null) return [];
    const cat = catById.get(subParam);
    if (!cat) return [];
    return visibleAssets.filter((a: any) => {
      if (a.category_id !== subParam) return false;
      const k = getGroupKey(a, domain, cat) ?? "";
      return k === groupParam;
    });
  }, [subParam, groupParam, visibleAssets, catById, domain]);

  const expiringCount = useMemo(
    () => (expiring ?? []).filter((e) => catIds.has(e.category_id)).length,
    [expiring, catIds],
  );

  // Detail view route: /assets/:domain/:itemId
  if (params.itemId) {
    const asset = (assets ?? []).find((a: any) => a.id === params.itemId);
    if (!asset) {
      return (
        <div className="p-8 text-center" dir="rtl">
          <p className="text-muted-foreground mb-4">הפריט לא נמצא</p>
          <Button onClick={() => navigate(`/assets/${domain}`)}>חזרה לרשימה</Button>
        </div>
      );
    }
    return (
      <div className="space-y-4 animate-fade-in" dir="rtl">
        <AssetDetailView
          assetId={asset.id}
          categoryId={asset.category_id}
          onBack={() => navigate(`/assets/${domain}`)}
          onBackToCategories={() => navigate("/assets")}
        />
      </div>
    );
  }

  const drilledCategory = subParam ? catById.get(subParam) : null;
  const isDrilled = !!(subParam && groupParam !== null && drilledCategory);

  const updateParam = (key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (value === null) p.delete(key);
    else p.set(key, value);
    setSearchParams(p, { replace: true });
  };

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/assets")} className="gap-1">
            <ChevronRight className="w-4 h-4" />
            דומיינים
          </Button>
          {isDrilled && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParam("group", null)}
              className="gap-1"
            >
              <ChevronRight className="w-4 h-4" />
              {drilledCategory?.category_name}
            </Button>
          )}
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", meta.color.bg, meta.color.text)}>
            <Icon className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold">
              {isDrilled ? groupParam : meta.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isDrilled
                ? `${drilledItems.length} מופעים · ${drilledCategory?.category_name}`
                : <>
                    {domainAssets.length} פריטים · {domainCats.length} תתי-קטגוריות
                    {expiringCount > 0 && <> · <span className="text-warning">{expiringCount} פגי תוקף בקרוב</span></>}
                  </>}
            </p>
          </div>
        </div>

        <Button
          onClick={() => {
            setAddCategoryId(subParam ?? domainCats[0]?.id);
            setAddOpen(true);
          }}
          disabled={domainCats.length === 0}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          פריט חדש
        </Button>
      </div>

      {/* Search + sub-category chips + sort */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש בדומיין (שם / קוד / מס׳ סידורי / עובד)..."
            className="bg-transparent text-sm outline-none w-full"
            aria-label="חיפוש"
          />
        </div>

        {!isDrilled && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {domainCats.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => updateParam("sub", null)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    !subParam ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted",
                  )}
                >
                  הכל ({domainAssets.length})
                </button>
                {domainCats.map((c: any) => {
                  const count = domainAssets.filter((a: any) => a.category_id === c.id).length;
                  const active = subParam === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => updateParam("sub", active ? null : c.id)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full border transition-colors",
                        active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted",
                      )}
                    >
                      {c.category_name} ({count})
                    </button>
                  );
                })}
              </div>
            ) : <div />}

            <div className="flex items-center gap-1 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
              {([
                { v: "count", l: "הכי הרבה" },
                { v: "alpha", l: "א-ב" },
                { v: "expiry", l: "תפוגה" },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setSortMode(o.v)}
                  className={cn(
                    "px-2.5 py-1 rounded-md transition-colors",
                    sortMode === o.v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : domainCats.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground mb-3">אין עדיין קטגוריות בדומיין זה</p>
          <Button variant="outline" onClick={() => navigate("/assets?tab=categories")}>
            עבור לניהול קטגוריות
          </Button>
        </div>
      ) : isDrilled ? (
        // ----- Drilled view: instances table -----
        drilledItems.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
            <p className="text-muted-foreground">לא נמצאו מופעים</p>
          </div>
        ) : (
          <InstancesTable
            items={drilledItems}
            domain={domain}
            onSelect={(id) => navigate(`/assets/${domain}/${id}`)}
          />
        )
      ) : parentGroups.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">לא נמצאו פריטים תואמים</p>
        </div>
      ) : (
        // ----- Parent cards (grouped by sub-category) -----
        <div className="space-y-6">
          {Object.entries(
            parentGroups.reduce<Record<string, typeof parentGroups>>((acc, g) => {
              const k = g.category.id;
              if (!acc[k]) acc[k] = [];
              acc[k].push(g);
              return acc;
            }, {})
          ).map(([catId, groups]) => {
            const cat = catById.get(catId);
            return (
              <section key={catId}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-muted-foreground">
                    {cat?.category_name} <span className="font-normal">({groups.reduce((s, g) => s + g.items.length, 0)})</span>
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {groups.map((g) => {
                    // Flat-domain group: render single "passthrough" card per item
                    if (g.groupKey === null) {
                      return g.items.map((a: any) => (
                        <ParentCard
                          key={a.id}
                          name={a.asset_name ?? a.asset_code}
                          total={1}
                          activeCount={a.status === "in_use" || a.current_owner_id ? 1 : 0}
                          hasExpired={(() => {
                            const e = expiryOf(a, domain);
                            return !!(e && new Date(e) < new Date());
                          })()}
                          domain={domain}
                          isAssignable={cat?.is_assignable !== false}
                          onClick={() => navigate(`/assets/${domain}/${a.id}`)}
                        />
                      ));
                    }
                    const active = g.items.filter((a: any) => a.status === "in_use" || a.current_owner_id).length;
                    const hasExpired = g.items.some((a: any) => {
                      const e = expiryOf(a, domain);
                      return e && new Date(e) < new Date();
                    });
                    return (
                      <ParentCard
                        key={`${catId}-${g.groupKey}`}
                        name={g.groupKey!}
                        total={g.items.length}
                        activeCount={active}
                        hasExpired={hasExpired}
                        domain={domain}
                        isAssignable={cat?.is_assignable !== false}
                        onClick={() => {
                          const p = new URLSearchParams(searchParams);
                          p.set("sub", catId);
                          p.set("group", g.groupKey!);
                          setSearchParams(p, { replace: true });
                        }}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AddAssetDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddCategoryId(undefined);
        }}
        defaultCategoryId={addCategoryId}
      />
    </div>
  );
}

function ParentCard({
  name, total, activeCount, hasExpired, isAssignable, domain, onClick,
}: {
  name: string;
  total: number;
  activeCount: number;
  hasExpired: boolean;
  isAssignable: boolean;
  domain: DomainKey;
  onClick: () => void;
}) {
  const Icon = getCategoryIcon(name);
  const color = getCategoryColor(name);
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative bg-card border border-border rounded-2xl p-4 text-center",
        "hover:shadow-xl hover:-translate-y-1 hover:ring-2 active:scale-[0.98] transition-all duration-200",
        color.ring,
        "flex flex-col items-center gap-3 aspect-square justify-center",
      )}
    >
      <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
        {total}
      </span>
      {hasExpired && (
        <span className="absolute top-2 left-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/15 text-destructive" title="יש פריטים פגי תוקף">
          <AlertTriangle className="w-3 h-3" />
        </span>
      )}
      <div className={cn(
        "w-20 h-20 rounded-2xl flex items-center justify-center shadow-md ring-1 ring-border/40",
        "transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:ring-2",
        color.bg, color.text, color.ring,
      )}>
        <Icon className="w-10 h-10" strokeWidth={1.75} />
      </div>
      <div className="w-full">
        <div className="text-sm font-semibold line-clamp-2 leading-tight">{name}</div>
        {isAssignable && total > 1 && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" />
            {activeCount} פעילים / {total}
          </div>
        )}
      </div>
    </button>
  );
}

function InstancesTable({
  items, domain, onSelect,
}: {
  items: any[];
  domain: DomainKey;
  onSelect: (id: string) => void;
}) {
  const isInsurance = domain === "insurance";
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className={cn(
        "grid gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide",
        isInsurance ? "grid-cols-[2fr_2fr_1.2fr_1.5fr_2rem]" : "grid-cols-12"
      )}>
        {isInsurance ? (
          <>
            <div className="text-right">שם הביטוח</div>
            <div className="text-right">חברת ביטוח</div>
            <div className="text-right">תוקף פוליסה</div>
            <div className="text-right">סוכן ביטוח</div>
            <div></div>
          </>
        ) : (
          <>
            <div className="col-span-3 text-right">קוד</div>
            <div className="col-span-3 text-right">מס׳ סידורי</div>
            <div className="col-span-3 text-right">עובד</div>
            <div className="col-span-2 text-right">{domain === "physical" ? "סטטוס" : "תפוגה"}</div>
            <div className="col-span-1 text-left"></div>
          </>
        )}
      </div>
      {items.map((a: any) => {
        const exp = expiryOf(a, domain);
        const days = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000) : null;
        const expiryCls = days === null ? "text-muted-foreground" : days < 0 ? "text-destructive font-semibold" : days <= 30 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-foreground";
        const expiryTxt = days === null ? "—" : days < 0 ? `פג לפני ${Math.abs(days)}י׳` : days === 0 ? "פג היום" : days <= 30 ? `בעוד ${days}י׳` : new Date(exp!).toLocaleDateString("en-GB").replace(/\//g, "-");
        if (isInsurance) {
          const cf = a.custom_fields ?? {};
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a.id)}
              className="w-full grid grid-cols-[2fr_2fr_1.2fr_1.5fr_2rem] gap-2 px-4 py-3 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors"
            >
              <div className="font-medium truncate">{a.asset_name ?? "—"}</div>
              <div className="truncate">{cf["חברת ביטוח"] ?? <span className="text-muted-foreground">—</span>}</div>
              <div className={cn("text-xs", expiryCls)}>{expiryTxt}</div>
              <div className="truncate text-muted-foreground">{cf["שם סוכן ביטוח"] ?? "—"}</div>
              <div className="text-left text-muted-foreground">
                <ArrowRight className="w-4 h-4 mr-auto rtl:rotate-180" />
              </div>
            </button>
          );
        }
        return (
          <button
            key={a.id}
            onClick={() => onSelect(a.id)}
            className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors"
          >
            <div className="col-span-3 font-mono text-xs">{a.asset_code}</div>
            <div className="col-span-3 text-xs text-muted-foreground truncate">{a.serial_number ?? "—"}</div>
            <div className="col-span-3 truncate">{a.employees?.full_name ?? <span className="text-muted-foreground">—</span>}</div>
            <div className="col-span-2">
              {domain === "physical" ? (
                <span className={cn("text-xs px-2 py-0.5 rounded-full", assetStatusClasses[a.status])}>
                  {assetStatusLabels[a.status] ?? a.status}
                </span>
              ) : (
                <span className={cn("text-xs", expiryCls)}>{expiryTxt}</span>
              )}
            </div>
            <div className="col-span-1 text-left text-muted-foreground">
              <ArrowRight className="w-4 h-4 mr-auto rtl:rotate-180" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
