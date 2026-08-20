import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight, ChevronDown, Search, Plus, ArrowRight, Users, AlertTriangle,
  ArrowUpDown, LayoutGrid, List, FolderPlus, Check, X, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubCategorySelect } from "@/components/assets/SubCategorySelect";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useAssetGroups, useCreateAssetGroup, useAssignAssetsToGroup } from "@/hooks/useAssetGroups";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { AssetDetailView } from "@/components/assets/AssetDetailView";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { resolveOwnerRole, OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import {
  DOMAIN_META,
  getDomain,
  domainSlugToKey,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
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

interface SubCard {
  id: string;            // group id, or NO_SUBCATEGORY_KEY
  name: string;
  items: any[];
  ownerRole: string | null;
}

export default function AssetsDomainPage() {
  const params = useParams<{ domain: string; itemId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: groups } = useAssetGroups();
  const { data: expiring } = useExpiringAssets(30);
  const createGroup = useCreateAssetGroup();
  const assignToGroup = useAssignAssetsToGroup();

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("assets-domain-view") as "grid" | "list") || "grid";
  });
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);
  const [addGroupId, setAddGroupId] = useState<string | undefined>(undefined);
  const [newSubFor, setNewSubFor] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [assignTarget, setAssignTarget] = useState("");

  const changeView = (v: "grid" | "list") => {
    setViewMode(v);
    try { localStorage.setItem("assets-domain-view", v); } catch { /* ignore */ }
  };
  const toggleCat = (id: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const domainKey = domainSlugToKey(params.domain);
  const domain = (domainKey ?? "physical") as DomainKey;
  const meta = DOMAIN_META[domain];
  const Icon = meta.icon;
  const catParam = searchParams.get("cat");
  const subParam = searchParams.get("sub");

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
    const m = new Map<string, any>();
    for (const g of groups ?? []) m.set(g.id, g);
    return m;
  }, [groups]);

  const domainAssets = useMemo(
    () => (assets ?? []).filter((a: any) => catIds.has(a.category_id)),
    [assets, catIds],
  );

  const matchesSearch = (a: any, q: string) => {
    if (!q) return true;
    const sub = a.group_id ? groupsById.get(a.group_id)?.name ?? "" : NO_SUBCATEGORY_LABEL;
    return (
      a.asset_name?.toLowerCase().includes(q) ||
      a.asset_code?.toLowerCase().includes(q) ||
      a.serial_number?.toLowerCase().includes(q) ||
      a.license_plate?.toLowerCase().includes(q) ||
      a.employees?.full_name?.toLowerCase().includes(q) ||
      sub.toLowerCase().includes(q)
    );
  };

  // Assets after category filter + search
  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return domainAssets.filter((a: any) => {
      if (catParam && a.category_id !== catParam) return false;
      return matchesSearch(a, q);
    });
  }, [domainAssets, search, catParam, groupsById]);

  /** Sub-category cards per category — sourced from asset_groups (incl. empty ones). */
  const cardsByCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: { category: any; cards: SubCard[]; total: number }[] = [];
    const cats = catParam ? domainCats.filter((c: any) => c.id === catParam) : domainCats;

    for (const cat of cats) {
      const catAssets = visibleAssets.filter((a: any) => a.category_id === cat.id);
      const catGroups = (groups ?? []).filter((g: any) => g.category_id === cat.id);
      const cards: SubCard[] = catGroups.map((g: any) => ({
        id: g.id,
        name: g.name,
        items: catAssets.filter((a: any) => a.group_id === g.id),
        ownerRole: resolveOwnerRole(g, cat),
      }));
      const unassigned = catAssets.filter((a: any) => !a.group_id);
      if (unassigned.length > 0) {
        cards.push({
          id: NO_SUBCATEGORY_KEY,
          name: NO_SUBCATEGORY_LABEL,
          items: unassigned,
          ownerRole: null,
        });
      }
      // While searching, keep only cards that have matches or whose name matches
      const filtered = q
        ? cards.filter((c) => c.items.length > 0 || c.name.toLowerCase().includes(q))
        : cards;
      if (filtered.length === 0 && catAssets.length === 0 && q) continue;

      filtered.sort((a, b) => {
        if (a.id === NO_SUBCATEGORY_KEY) return 1;
        if (b.id === NO_SUBCATEGORY_KEY) return -1;
        if (sortMode === "alpha") return a.name.localeCompare(b.name, "he");
        if (sortMode === "expiry") {
          const min = (list: any[]) => list.reduce<number>((acc, it) => {
            const e = expiryOf(it, domain);
            if (!e) return acc;
            const t = new Date(e).getTime();
            return t < acc ? t : acc;
          }, Number.POSITIVE_INFINITY);
          return min(a.items) - min(b.items);
        }
        if (b.items.length !== a.items.length) return b.items.length - a.items.length;
        return a.name.localeCompare(b.name, "he");
      });

      out.push({ category: cat, cards: filtered, total: catAssets.length });
    }
    return out;
  }, [domainCats, catParam, visibleAssets, groups, sortMode, domain, search]);

  const drilledCategory = catParam ? catById.get(catParam) : null;
  const isDrilled = !!(catParam && subParam && drilledCategory);
  const drilledSubName = !subParam
    ? ""
    : subParam === NO_SUBCATEGORY_KEY
      ? NO_SUBCATEGORY_LABEL
      : groupsById.get(subParam)?.name ?? "—";

  const drilledItems = useMemo(() => {
    if (!isDrilled) return [];
    return visibleAssets.filter((a: any) => {
      if (a.category_id !== catParam) return false;
      return subParam === NO_SUBCATEGORY_KEY ? !a.group_id : a.group_id === subParam;
    });
  }, [isDrilled, visibleAssets, catParam, subParam]);

  const expiringCount = useMemo(
    () => (expiring ?? []).filter((e) => catIds.has(e.category_id)).length,
    [expiring, catIds],
  );

  const updateParams = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    setSearchParams(p, { replace: true });
  };

  const handleCreateSub = async (cat: any) => {
    const name = newSubName.trim();
    if (!name) return;
    try {
      await createGroup.mutateAsync({
        category_id: cat.id,
        name,
        company_id: cat.company_id ?? null,
        default_owner_role: cat.default_owner_role ?? null,
      });
      setNewSubName("");
      setNewSubFor(null);
      toast({ title: "תת-הקטגוריה נוצרה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkAssign = async () => {
    if (!assignTarget || selectedIds.size === 0) return;
    try {
      await assignToGroup.mutateAsync({ groupId: assignTarget, assetIds: Array.from(selectedIds) });
      toast({ title: `${selectedIds.size} פריטים שויכו לתת-קטגוריה` });
      setSelectedIds(new Set());
      setAssignTarget("");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  if (!domainKey) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-muted-foreground mb-4">דומיין לא קיים: {params.domain}</p>
        <Button onClick={() => navigate("/assets")}>חזרה למסך משאבים</Button>
      </div>
    );
  }

  // Item detail route: /assets/:domain/:itemId
  if (params.itemId) {
    const asset = (assets ?? []).find((a: any) => a.id === params.itemId);
    if (!asset) {
      return (
        <div className="p-8 text-center" dir="rtl">
          <p className="text-muted-foreground mb-4">הפריט לא נמצא</p>
          <Button onClick={() => navigate(`/assets/${params.domain}`)}>חזרה לרשימה</Button>
        </div>
      );
    }
    return (
      <div className="space-y-4 animate-fade-in" dir="rtl">
        <AssetDetailView
          assetId={asset.id}
          categoryId={asset.category_id}
          onBack={() => navigate(`/assets/${params.domain}`)}
          onBackToCategories={() => navigate("/assets")}
        />
      </div>
    );
  }




  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/assets")} className="gap-1">
            <ChevronRight className="w-4 h-4" />
            דומיינים
          </Button>
          {catParam && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParams({ cat: null, sub: null })}
              className="gap-1"
            >
              <ChevronRight className="w-4 h-4" />
              {meta.title}
            </Button>
          )}
          {isDrilled && (
            <Button variant="ghost" size="sm" onClick={() => updateParams({ sub: null })} className="gap-1">
              <ChevronRight className="w-4 h-4" />
              {drilledCategory?.category_name}
            </Button>
          )}
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", meta.color.bg, meta.color.text)}>
            <Icon className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-bold">
              {isDrilled ? drilledSubName : catParam ? drilledCategory?.category_name ?? meta.title : meta.title}
            </h1>
            {isDrilled ? (
              <p className="text-sm text-muted-foreground">
                {drilledCategory?.category_name} · תת-קטגוריה
              </p>
            ) : expiringCount > 0 ? (
              <p className="text-sm text-warning">{expiringCount} פגי תוקף בקרוב</p>
            ) : null}
          </div>
        </div>

        <Button
          onClick={() => {
            setAddCategoryId(catParam ?? domainCats[0]?.id);
            setAddGroupId(subParam && subParam !== NO_SUBCATEGORY_KEY ? subParam : undefined);
            setAddOpen(true);
          }}
          disabled={domainCats.length === 0}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" />
          פריט חדש
        </Button>
      </div>

      {/* Search + category chips + sort */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש (שם / קוד / מס׳ סידורי / עובד / תת-קטגוריה)..."
            className="bg-transparent text-sm outline-none w-full"
            aria-label="חיפוש"
          />
        </div>

        {!isDrilled && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {domainCats.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => updateParams({ cat: null, sub: null })}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border transition-colors",
                    !catParam ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted",
                  )}
                >
                  כל הקטגוריות ({domainAssets.length})
                </button>
                {domainCats.map((c: any) => {
                  const count = domainAssets.filter((a: any) => a.category_id === c.id).length;
                  const active = catParam === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => updateParams({ cat: active ? null : c.id, sub: null })}
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

            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
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
              <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5">
                <button
                  onClick={() => changeView("grid")}
                  title="תצוגת אייקונים"
                  className={cn(
                    "p-1 rounded transition-colors",
                    viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => changeView("list")}
                  title="תצוגת רשימה"
                  className={cn(
                    "p-1 rounded transition-colors",
                    viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
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
        <div className="space-y-3">
          {subParam === NO_SUBCATEGORY_KEY && drilledItems.length > 0 && (
            <div className="bg-warning/5 border border-warning/30 rounded-xl p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                {selectedIds.size > 0 ? `${selectedIds.size} נבחרו` : "בחר פריטים כדי לשייך אותם לתת-קטגוריה"}
              </span>
              <div className="w-64">
                <SubCategorySelect
                  categoryId={drilledCategory?.id ?? ""}
                  companyId={drilledCategory?.company_id ?? null}
                  defaultOwnerRole={drilledCategory?.default_owner_role ?? null}
                  value={assignTarget}
                  onChange={setAssignTarget}
                />
              </div>

              <Button
                size="sm"
                className="gap-1.5"
                disabled={!assignTarget || selectedIds.size === 0 || assignToGroup.isPending}
                onClick={handleBulkAssign}
              >
                <Link2 className="w-3.5 h-3.5" />
                שייך
              </Button>
            </div>
          )}
          {drilledItems.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
              <p className="text-muted-foreground">לא נמצאו פריטים</p>
            </div>
          ) : (
            <InstancesTable
              items={drilledItems}
              domain={domain}
              selectable={subParam === NO_SUBCATEGORY_KEY}
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
              onSelect={(id) => navigate(`/assets/${params.domain}/${id}`)}
            />
          )}
        </div>
      ) : cardsByCategory.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">לא נמצאו תוצאות</p>
        </div>
      ) : (
        <div className="space-y-6">
          {cardsByCategory.map(({ category, cards, total }) => {
            const collapsed = collapsedCats.has(category.id);
            const isAssignable = category.is_assignable !== false;
            return (
              <section key={category.id}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <button onClick={() => toggleCat(category.id)} className="flex items-center group">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground transition-colors">
                      <ChevronDown className={cn("w-4 h-4 transition-transform", collapsed && "-rotate-90")} />
                      {category.category_name}
                      <span className="font-normal">
                        ({cards.filter((c) => c.id !== NO_SUBCATEGORY_KEY).length} תת-קטגוריות · {total} פריטים)
                      </span>
                    </h3>
                  </button>

                  {newSubFor === category.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); handleCreateSub(category); }
                          if (e.key === "Escape") { setNewSubFor(null); setNewSubName(""); }
                        }}
                        placeholder="שם תת-קטגוריה"
                        dir="rtl"
                        className="h-8 w-48 text-right"
                      />
                      <Button size="sm" className="h-8" disabled={!newSubName.trim() || createGroup.isPending} onClick={() => handleCreateSub(category)}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => { setNewSubFor(null); setNewSubName(""); }}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setNewSubFor(category.id); setNewSubName(""); }}
                      className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                      תת-קטגוריה חדשה
                    </button>
                  )}
                </div>

                {!collapsed && (cards.length === 0 ? (
                  <div className="bg-card border border-dashed border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
                    אין עדיין תת-קטגוריות בקטגוריה זו
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {cards.map((c) => (
                      <SubCategoryCard
                        key={c.id}
                        card={c}
                        domain={domain}
                        isAssignable={isAssignable}
                        onClick={() => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_7rem_5rem_6rem_2rem] gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">
                      <div>תת-קטגוריה</div>
                      <div>אחראי</div>
                      <div>סה״כ</div>
                      <div>פעילים</div>
                      <div></div>
                    </div>
                    {cards.map((c) => {
                      const active = c.items.filter((a: any) => a.status === "in_use" || a.current_owner_id).length;
                      const hasExpired = c.items.some((a: any) => {
                        const e = expiryOf(a, domain);
                        return e && new Date(e) < new Date();
                      });
                      return (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); }}
                          className="w-full grid grid-cols-[1fr_7rem_5rem_6rem_2rem] gap-2 px-4 py-2.5 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {hasExpired && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                            <span className={cn("truncate font-medium", c.id === NO_SUBCATEGORY_KEY && "text-muted-foreground")}>
                              {c.name}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.ownerRole ? OWNER_ROLE_LABEL[c.ownerRole] ?? c.ownerRole : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{c.items.length}</div>
                          <div className="text-xs">{active} / {c.items.length}</div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                        </button>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <AddAssetDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) { setAddCategoryId(undefined); setAddGroupId(undefined); }
        }}
        defaultCategoryId={addCategoryId}
        defaultGroupId={addGroupId}
      />
    </div>
  );
}

function SubCategoryCard({
  card, domain, isAssignable, onClick,
}: {
  card: SubCard;
  domain: DomainKey;
  isAssignable: boolean;
  onClick: () => void;
}) {
  const Icon = getCategoryIcon(card.name);
  const color = getCategoryColor(card.name);
  const total = card.items.length;
  const activeCount = card.items.filter((a: any) => a.status === "in_use" || a.current_owner_id).length;
  const hasExpired = card.items.some((a: any) => {
    const e = expiryOf(a, domain);
    return e && new Date(e) < new Date();
  });
  const isUnassigned = card.id === NO_SUBCATEGORY_KEY;

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative bg-card border rounded-2xl p-4 text-center",
        "hover:shadow-xl hover:-translate-y-1 hover:ring-2 active:scale-[0.98] transition-all duration-200",
        isUnassigned ? "border-dashed border-warning/50 hover:ring-warning/30" : cn("border-border", color.ring),
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
        isUnassigned ? "bg-warning/10 text-warning" : cn(color.bg, color.text, color.ring),
      )}>
        {isUnassigned ? <AlertTriangle className="w-10 h-10" strokeWidth={1.75} /> : <Icon className="w-10 h-10" strokeWidth={1.75} />}
      </div>
      <div className="w-full">
        <div className="text-sm font-semibold line-clamp-2 leading-tight">{card.name}</div>
        {isAssignable && total > 0 && !isUnassigned && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
            <Users className="w-3 h-3" />
            {activeCount} פעילים / {total}
          </div>
        )}
        {!isUnassigned && card.ownerRole && (
          <div className="text-[10px] text-muted-foreground mt-0.5">
            אחראי: {OWNER_ROLE_LABEL[card.ownerRole] ?? card.ownerRole}
          </div>
        )}
      </div>
    </button>
  );
}

function InstancesTable({
  items, domain, onSelect, selectable, selectedIds, onToggleSelect,
}: {
  items: any[];
  domain: DomainKey;
  onSelect: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const isInsurance = domain === "insurance";
  const cols = isInsurance ? "grid-cols-[2fr_2fr_1.2fr_1.5fr_2rem]" : "grid-cols-12";
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className={cn("grid gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide", cols)}>
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
        const expiryTxt = days === null ? "—" : days < 0 ? `פג לפני ${Math.abs(days)}י׳` : days === 0 ? "פג היום" : days <= 30 ? `בעוד ${days}י׳` : new Date(exp!).toLocaleDateString("en-GB");
        const checkbox = selectable ? (
          <input
            type="checkbox"
            checked={selectedIds?.has(a.id) ?? false}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.(a.id)}
            className="ml-2 accent-primary"
            aria-label="בחר פריט"
          />
        ) : null;

        if (isInsurance) {
          const cf = a.custom_fields ?? {};
          return (
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(a.id)}
              onKeyDown={(e) => { if (e.key === "Enter") onSelect(a.id); }}
              className={cn("w-full grid gap-2 px-4 py-3 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors cursor-pointer", cols)}
            >
              <div className="font-medium truncate flex items-center">{checkbox}{a.asset_name ?? "—"}</div>
              <div className="truncate">{cf["חברת ביטוח"] ?? <span className="text-muted-foreground">—</span>}</div>
              <div className={cn("text-xs", expiryCls)}>{expiryTxt}</div>
              <div className="truncate text-muted-foreground">{cf["שם סוכן ביטוח"] ?? "—"}</div>
              <div className="text-left text-muted-foreground">
                <ArrowRight className="w-4 h-4 mr-auto rtl:rotate-180" />
              </div>
            </div>
          );
        }
        return (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => { if (e.key === "Enter") onSelect(a.id); }}
            className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t border-border hover:bg-muted/40 text-right items-center transition-colors cursor-pointer"
          >
            <div className="col-span-3 font-mono text-xs flex items-center">{checkbox}{a.asset_code}</div>
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
          </div>
        );
      })}
    </div>
  );
}
