import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Search, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { AssetDetailView } from "@/components/assets/AssetDetailView";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import {
  DOMAIN_META,
  classifyCategory,
  isDomainKey,
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

export default function AssetsDomainPage() {
  const params = useParams<{ domain: string; itemId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: expiring } = useExpiringAssets(30);

  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);

  if (!isDomainKey(params.domain)) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-muted-foreground mb-4">דומיין לא קיים: {params.domain}</p>
        <Button onClick={() => navigate("/assets")}>חזרה למסך משאבים</Button>
      </div>
    );
  }
  const domain: DomainKey = params.domain;
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;
  const subParam = searchParams.get("sub");

  const domainCats = useMemo(
    () => (categories ?? []).filter((c: any) => classifyCategory(c) === domain),
    [categories, domain],
  );
  const catIds = useMemo(() => new Set(domainCats.map((c: any) => c.id)), [domainCats]);

  const domainAssets = useMemo(
    () => (assets ?? []).filter((a: any) => catIds.has(a.category_id)),
    [assets, catIds],
  );

  // Filter by search and by active sub-category
  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return domainAssets.filter((a: any) => {
      if (subParam && a.category_id !== subParam) return false;
      if (!q) return true;
      return (
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q) ||
        a.employees?.full_name?.toLowerCase().includes(q)
      );
    });
  }, [domainAssets, search, subParam]);

  // Group by sub-category for display
  const groups = useMemo(() => {
    const byCat = new Map<string, any[]>();
    for (const a of visibleAssets) {
      if (!byCat.has(a.category_id)) byCat.set(a.category_id, []);
      byCat.get(a.category_id)!.push(a);
    }
    return Array.from(byCat.entries())
      .map(([catId, items]) => ({
        category: domainCats.find((c: any) => c.id === catId),
        items,
      }))
      .filter((g) => g.category)
      .sort((a, b) => b.items.length - a.items.length);
  }, [visibleAssets, domainCats]);

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

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/assets")}
            className="gap-1"
          >
            <ChevronRight className="w-4 h-4" />
            דומיינים
          </Button>
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", meta.color.bg, meta.color.text)}>
            <Icon className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold">{meta.title}</h1>
            <p className="text-sm text-muted-foreground">
              {domainAssets.length} פריטים · {domainCats.length} תתי-קטגוריות
              {expiringCount > 0 && <> · <span className="text-warning">{expiringCount} פגי תוקף בקרוב</span></>}
            </p>
          </div>
        </div>

        <Button
          onClick={() => {
            setAddCategoryId(domainCats[0]?.id);
            setAddOpen(true);
          }}
          disabled={domainCats.length === 0}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          פריט חדש
        </Button>
      </div>

      {/* Search + sub-category chips */}
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

        {domainCats.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => {
                const p = new URLSearchParams(searchParams);
                p.delete("sub");
                setSearchParams(p, { replace: true });
              }}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                !subParam
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
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
                  onClick={() => {
                    const p = new URLSearchParams(searchParams);
                    if (active) p.delete("sub");
                    else p.set("sub", c.id);
                    setSearchParams(p, { replace: true });
                  }}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border hover:bg-muted",
                  )}
                >
                  {c.category_name} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Items list (grouped by sub-category) */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : domainCats.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground mb-3">אין עדיין קטגוריות בדומיין זה</p>
          <Button variant="outline" onClick={() => navigate("/assets?tab=categories")}>
            עבור לניהול קטגוריות
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">לא נמצאו פריטים תואמים</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ category, items }) => (
            <section key={category.id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {category.category_name} <span className="font-normal">({items.length})</span>
                </h3>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <div className="col-span-4 text-right">שם</div>
                  <div className="col-span-2 text-right">קוד</div>
                  <div className="col-span-3 text-right">עובד</div>
                  <div className="col-span-2 text-right">
                    {domain === "physical" ? "סטטוס" : "תפוגה"}
                  </div>
                  <div className="col-span-1 text-left"></div>
                </div>
                {items.map((a: any) => {
                  const expiryDate = domain === "digital"
                    ? (a.license_expires_at || a.password_expires_at)
                    : domain === "licenses"
                      ? a.license_expires_at
                      : a.expiry_date;
                  const days = expiryDate ? Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000) : null;
                  const expiryCls = days === null ? "text-muted-foreground" : days < 0 ? "text-destructive font-semibold" : days <= 30 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-foreground";
                  const expiryTxt = days === null ? "—" : days < 0 ? `פג לפני ${Math.abs(days)}י׳` : days === 0 ? "פג היום" : days <= 30 ? `בעוד ${days}י׳` : new Date(expiryDate).toLocaleDateString("en-GB").replace(/\//g, "-");
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/assets/${domain}/${a.id}`)}
                      className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors"
                    >
                      <div className="col-span-4 font-medium truncate">{a.asset_name}</div>
                      <div className="col-span-2 font-mono text-xs text-muted-foreground">{a.asset_code}</div>
                      <div className="col-span-3 text-muted-foreground truncate">
                        {a.employees?.full_name ?? "—"}
                      </div>
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
            </section>
          ))}
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
