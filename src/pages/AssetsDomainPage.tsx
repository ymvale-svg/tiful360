import { formatDateDMY } from "@/lib/utils";
import { useNextInsurancePayments } from "@/hooks/useInsurancePayments";
import { RowContextMenu, copyAction, openInNewTab, type ContextAction } from "@/components/context/RowContextMenu";
import React, { useMemo, useState } from "react";
import { usePersistentFilter } from "@/hooks/usePersistentFilter";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ChevronRight, ChevronDown, Search, Plus, ArrowRight, Users, AlertTriangle,
  ArrowUpDown, LayoutGrid, List, FolderPlus, Check, X, Link2, Trash2, FileSignature,
  ChevronUp, ChevronsUpDown, Building2, Columns3, Pencil,

} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SubCategorySelect } from "@/components/assets/SubCategorySelect";
import { SubCategoryFieldsChecklist } from "@/components/SubCategoryFieldsInline";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { IconButton } from "@/components/feedback/IconButton";
import { EmptyState, ListSkeleton } from "@/components/feedback/StateView";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useAssetGroups, useCreateAssetGroup, useAssignAssetsToGroup, useDeleteAssetGroup, useUpdateAssetGroup } from "@/hooks/useAssetGroups";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { AssetDetailView } from "@/components/assets/AssetDetailView";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { MultiHandoverFlow } from "@/components/handover/MultiHandoverFlow";
import { PendingSignatureDialog } from "@/components/handover/PendingSignatureDialog";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { resolveOwnerRole, OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import { EmployeeLink } from "@/components/EmployeeLink";
import {
  DOMAIN_META,
  getDomain,
  domainSlugToKey,
  domainKeyToSlug,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
  type DomainKey,
} from "@/lib/assetDomains";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש",
  in_stock: "במלאי",
  in_repair: "בתיקון",
  lost: "אבד",
  inactive: "לא פעיל",
};
const assetStatusClasses: Record<string, string> = {
  in_use: "status-active",
  in_stock: "status-onboarding",
  in_repair: "status-leaving",
  lost: "status-inactive",
  inactive: "status-inactive",
};

type SortMode = "count" | "alpha" | "expiry";

function insuranceStatus(a: any, domain: DomainKey): { label: string; cls: string } {
  if (a.status === "inactive") return { label: "לא פעיל", cls: "status-inactive" };
  const e = expiryOf(a, domain);
  if (e && e < new Date().toISOString().slice(0, 10)) return { label: "פג תוקף", cls: "status-leaving" };
  return { label: "בתוקף", cls: "status-active" };
}

function expiryOf(a: any, domain: DomainKey): string | null {
  if (domain === "digital") return a.license_expires_at || a.password_expires_at || null;
  if (domain === "licenses") return a.license_expires_at || null;
  if (a.expiry_date) return a.expiry_date;
  // Fallback: a custom date field such as "תוקף חוזה" / "תפוגה" / "תאריך סיום".
  const cf = a.custom_fields ?? {};
  for (const k of Object.keys(cf)) {
    if (/תוקף|תפוגה|סיום/.test(k) && typeof cf[k] === "string" && /^\d{4}-\d{2}-\d{2}/.test(cf[k])) return cf[k];
  }
  return null;
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
  const deleteGroup = useDeleteAssetGroup();
  const updateGroup = useUpdateAssetGroup();
  const confirm = useConfirm();

  const handleDeleteGroup = async (groupId: string, groupName: string, itemCount: number) => {
    const ok = await confirm({
      title: `למחוק את תת-הקטגוריה "${groupName}"?`,
      description: itemCount > 0
        ? `${itemCount} פריטים יעברו ל"ללא תת-קטגוריה". הפריטים עצמם לא יימחקו.`
        : "תת-הקטגוריה ריקה.",
      confirmLabel: "מחק תת-קטגוריה",
      destructive: true,
      onConfirm: () => deleteGroup.mutateAsync(groupId),
    });
    if (ok) toast({ title: "תת-הקטגוריה נמחקה" });
  };

  const handleRenameGroup = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name || name === renameTarget.name) { setRenameTarget(null); return; }
    try {
      await updateGroup.mutateAsync({ id: renameTarget.id, name });
      toast({ title: "שם תת-הקטגוריה עודכן" });
      setRenameTarget(null);
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    }
  };

  /** Right-click menu actions for a sub-category card/row. */
  const subMenuActions = (category: any, c: any): ContextAction[] => [
    {
      label: "פתח את התת-קטגוריה",
      onSelect: () => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); },
    },
    {
      label: "פתח בכרטיסייה חדשה",
      onSelect: () => openInNewTab(`/assets/${params.domain}?cat=${category.id}&sub=${c.id}`),
    },
    {
      label: "ערוך תת-קטגוריה",
      when: c.id !== NO_SUBCATEGORY_KEY,
      roles: ["super_admin", "operations"],
      separator: true,
      onSelect: () => { setRenameTarget(c); setRenameName(c.name); },
    },
    {
      label: "שדות בחלון",
      when: c.id !== NO_SUBCATEGORY_KEY,
      roles: ["super_admin", "operations"],
      onSelect: () => setFieldsTargetId(c.id),
    },
    {
      label: "מחק תת-קטגוריה",
      when: c.id !== NO_SUBCATEGORY_KEY,
      danger: true,
      roles: ["super_admin", "operations"],
      onSelect: () => handleDeleteGroup(c.id, c.name, c.items.length),
    },
    copyAction("העתק שם", c.name, true),
  ];



  const [search, setSearch] = usePersistentFilter<string>(`assets:${params.domain}:search`, "");
  const [sortMode, setSortMode] = usePersistentFilter<SortMode>(`assets:${params.domain}:sort`, "count");
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("assets-domain-view") as "grid" | "list") || "grid";
  });
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);
  const [addGroupId, setAddGroupId] = useState<string | undefined>(undefined);
  const [newSubFor, setNewSubFor] = useState<string | null>(null);
  const [fieldsTargetId, setFieldsTargetId] = useState<string | null>(null);
  const { data: allGroupsForFields } = useAssetGroups();
  const fieldsGroup = (allGroupsForFields ?? []).find((g: any) => g.id === fieldsTargetId) ?? null;
  const [newSubName, setNewSubName] = useState("");
  const [renameTarget, setRenameTarget] = useState<SubCard | null>(null);
  const [renameName, setRenameName] = useState("");
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
  const expiredOnly = searchParams.get("expired") === "1";

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
      a.sites?.name?.toLowerCase().includes(q) ||
      sub.toLowerCase().includes(q)
    );
  };

  // Assets after category filter + search
  const visibleAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const todayStr = new Date().toISOString().slice(0, 10);
    return domainAssets.filter((a: any) => {
      if (catParam && a.category_id !== catParam) return false;
      if (expiredOnly) {
        const e = expiryOf(a, domain);
        if (!e || e.slice(0, 10) >= todayStr) return false;
      }
      return matchesSearch(a, q);
    });
  }, [domainAssets, search, catParam, groupsById, expiredOnly, domain]);

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
    // Moving between category / sub-category levels adds a history entry, so the browser's
    // Back button steps back one level instead of leaving the domain.
    const changesLevel = ("cat" in next && next.cat !== catParam) || ("sub" in next && next.sub !== subParam);
    setSearchParams(p, { replace: !changesLevel });
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

  const clearFilters = () => {
    setSearch("");
    updateParams({ expired: null });
  };
  const openAddHere = () => {
    setAddCategoryId(catParam ?? domainCats[0]?.id);
    setAddGroupId(subParam && subParam !== NO_SUBCATEGORY_KEY ? subParam : undefined);
    setAddOpen(true);
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
    if (!asset && isLoading) {
      return (
        <div role="status" aria-busy="true" className="space-y-4" dir="rtl">
          <span className="sr-only">טוען את פרטי הפריט…</span>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      );
    }
    if (!asset) {
      return (
        <div className="p-8 text-center" dir="rtl">
          <p className="text-muted-foreground mb-4">הפריט לא נמצא</p>
          <Button onClick={() => navigate(`/assets/${params.domain}`)}>חזרה לרשימה</Button>
        </div>
      );
    }
    const signFormId = searchParams.get("signForm");
    return (
      <div className="space-y-4 animate-fade-in" dir="rtl">
        <AssetDetailView
          assetId={asset.id}
          categoryId={asset.category_id}
          onBack={() => navigate(`/assets/${params.domain}?cat=${asset.category_id}`)}
          onBackToCategories={() => navigate("/assets")}
        />
        <PendingSignatureDialog
          formId={signFormId}
          open={!!signFormId}
          onOpenChange={(o) => { if (!o) updateParams({ signForm: null }); }}
        />
      </div>
    );
  }




  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {/* Breadcrumb + header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => navigate("/assets")}
            className="inline-flex items-center gap-1 rounded-md border border-link-back bg-link-back-bg px-2 py-1 text-xs font-semibold text-link-back no-underline transition-[filter] hover:brightness-95"
          >
            <ChevronRight className="w-4 h-4" />
            דומיינים
          </button>
          {catParam && (
            <button
              type="button"
              onClick={() => updateParams({ cat: null, sub: null })}
              className="inline-flex items-center gap-1 rounded-md border border-link-domain bg-link-domain-bg px-2 py-1 text-xs font-semibold text-link-domain no-underline transition-[filter] hover:brightness-95"
            >
              <ChevronRight className="w-4 h-4" />
              {meta.title}
            </button>
          )}
          {isDrilled && (
            <button
              type="button"
              onClick={() => updateParams({ sub: null })}
              className="inline-flex items-center gap-1 rounded-md border border-link-category bg-link-category-bg px-2 py-1 text-xs font-semibold text-link-category no-underline transition-[filter] hover:brightness-95"
            >
              <ChevronRight className="w-4 h-4" />
              {drilledCategory?.category_name}
            </button>
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

      {expiredOnly && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            מציג רק פריטים שפג תוקפם ({visibleAssets.length})
            <button
              type="button"
              onClick={() => updateParams({ expired: null })}
              className="ms-1 -my-1 inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-destructive/20"
              aria-label="בטל סינון פגי תוקף"
              title="בטל סינון"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </span>
        </div>
      )}

      {/* Search + category chips + sort */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Search className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש (שם / קוד / מס׳ סידורי / עובד / תת-קטגוריה)..."
            className="min-h-10 bg-transparent text-base outline-none w-full placeholder:text-muted-foreground"
            aria-label="חיפוש"
          />
        </div>

        {!isDrilled && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {domainCats.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={!catParam}
                  onClick={() => updateParams({ cat: null, sub: null })}
                  className={cn(
                    "text-xs min-h-9 px-3 py-1.5 rounded-full border transition-colors",
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
                      type="button"
                      aria-pressed={active}
                      onClick={() => updateParams({ cat: active ? null : c.id, sub: null })}
                      className={cn(
                        "text-xs min-h-9 px-3 py-1.5 rounded-full border transition-colors",
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
              <div className="flex items-center gap-1" role="group" aria-label="מיון תתי-קטגוריות">
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                {([
                  { v: "count", l: "הכי הרבה" },
                  { v: "alpha", l: "א-ב" },
                  { v: "expiry", l: "תפוגה" },
                ] as const).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={sortMode === o.v}
                    onClick={() => setSortMode(o.v)}
                    className={cn(
                      "min-h-10 px-3 py-1 rounded-md transition-colors",
                      sortMode === o.v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="תצוגה">
                <IconButton
                  label="תצוגת אייקונים"
                  aria-pressed={viewMode === "grid"}
                  onClick={() => changeView("grid")}
                  className={cn(viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground")}
                >
                  <LayoutGrid aria-hidden="true" />
                </IconButton>
                <IconButton
                  label="תצוגת רשימה"
                  aria-pressed={viewMode === "list"}
                  onClick={() => changeView("list")}
                  className={cn(viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground")}
                >
                  <List aria-hidden="true" />
                </IconButton>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div role="status" aria-busy="true" className="bg-card border border-border rounded-2xl">
          <span className="sr-only">טוען פריטים…</span>
          <ListSkeleton rows={5} />
        </div>
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
          {selectedIds.size > 0 && (
            <div className="sticky bottom-3 z-20 bg-card border border-primary/40 shadow-lg rounded-xl p-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{selectedIds.size} פריטים נבחרו</span>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="gap-1">
                <X className="w-3.5 h-3.5" /> נקה בחירה
              </Button>
              <div className="flex-1" />
              <Button size="sm" className="gap-1.5" onClick={() => setHandoverOpen(true)}>
                <FileSignature className="w-4 h-4" />
                מסור {selectedIds.size} פריטים
              </Button>
            </div>
          )}
          {drilledItems.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-2xl">
              {search.trim() || expiredOnly ? (
                <EmptyState
                  title="לא נמצאו פריטים"
                  description={search.trim() ? `אין פריטים שתואמים את "${search.trim()}" בתת-קטגוריה זו.` : "אין פריטים שפג תוקפם בתת-קטגוריה זו."}
                  action={<Button variant="outline" onClick={clearFilters}>נקה סינון</Button>}
                />
              ) : (
                <EmptyState
                  title="אין עדיין פריטים בתת-קטגוריה זו"
                  action={<Button onClick={openAddHere} className="gap-1.5"><Plus aria-hidden="true" />פריט חדש</Button>}
                />
              )}
            </div>
          ) : (
            <InstancesTable
              items={drilledItems}
              domain={domain}
              columnsKey={`${domain}:${catParam ?? ""}:${subParam ?? ""}`}
              selectable
              selectedIds={selectedIds}
              onToggleSelect={(id) => setSelectedIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
              })}
              onSelectAll={(ids, checked) => setSelectedIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => checked ? next.add(id) : next.delete(id));
                return next;
              })}
              onSelect={(id) => navigate(`/assets/${params.domain}/${id}`)}
            />
          )}
        </div>
      ) : cardsByCategory.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl">
          <EmptyState
            title="לא נמצאו תוצאות"
            description={search.trim() ? `אין פריטים או תתי-קטגוריות שתואמים את "${search.trim()}".` : undefined}
            action={(search.trim() || expiredOnly || catParam)
              ? <Button variant="outline" onClick={clearFilters}>נקה סינון</Button>
              : <Button onClick={openAddHere} className="gap-1.5"><Plus aria-hidden="true" />פריט חדש</Button>}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {cardsByCategory.map(({ category, cards, total }) => {
            const collapsed = collapsedCats.has(category.id);
            const isAssignable = category.is_assignable !== false;
            return (
              <section key={category.id}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <RowContextMenu
                    actions={[
                      {
                        label: "פתח את הקטגוריה",
                        onSelect: () => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: null }); },
                      },
                      {
                        label: "פתח בכרטיסייה חדשה",
                        onSelect: () => openInNewTab(`/assets/${params.domain}?cat=${category.id}`),
                      },
                      {
                        label: "תת-קטגוריה חדשה",
                        roles: ["super_admin", "operations"],
                        separator: true,
                        onSelect: () => { setNewSubFor(category.id); setNewSubName(""); },
                      },
                      copyAction("העתק שם קטגוריה", category.category_name, true),
                    ]}
                  >
                  <button type="button" onClick={() => toggleCat(category.id)} aria-expanded={!collapsed} className="flex min-h-10 items-center group">
                    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5 group-hover:text-foreground transition-colors">
                      <ChevronDown aria-hidden="true" className={cn("w-4 h-4 transition-transform", collapsed && "-rotate-90")} />
                      {category.category_name}
                      <span className="font-normal">
                        ({cards.filter((c) => c.id !== NO_SUBCATEGORY_KEY).length} תת-קטגוריות · {total} פריטים)
                      </span>
                    </h3>
                  </button>
                  </RowContextMenu>

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
                        aria-label={`שם תת-קטגוריה חדשה ב${category.category_name}`}
                        dir="rtl"
                        className="h-10 w-48 text-right"
                      />
                      <IconButton label="צור תת-קטגוריה" variant="default" disabled={!newSubName.trim() || createGroup.isPending} onClick={() => handleCreateSub(category)}>
                        <Check aria-hidden="true" />
                      </IconButton>
                      <IconButton label="בטל יצירת תת-קטגוריה" onClick={() => { setNewSubFor(null); setNewSubName(""); }}>
                        <X aria-hidden="true" />
                      </IconButton>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setNewSubFor(category.id); setNewSubName(""); }}
                      className="min-h-10 px-2 rounded-md text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <FolderPlus className="w-3.5 h-3.5" aria-hidden="true" />
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
                      <RowContextMenu key={c.id} actions={subMenuActions(category, c)}>
                      <SubCategoryCard
                        card={c}
                        domain={domain}
                        isAssignable={isAssignable}
                        onClick={() => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); }}
                        onDelete={c.id === NO_SUBCATEGORY_KEY ? undefined : () => handleDeleteGroup(c.id, c.name, c.items.length)}
                        onEdit={c.id === NO_SUBCATEGORY_KEY ? undefined : () => { setRenameTarget(c); setRenameName(c.name); }}
                      />
                      </RowContextMenu>
                    ))}

                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl overflow-x-auto">
                    <div className="min-w-[34rem] grid grid-cols-[1fr_7rem_5rem_6rem_2.5rem_2rem] gap-2 px-4 py-2 bg-muted/40 text-[0.8125rem] font-semibold text-muted-foreground uppercase tracking-wide text-right">
                      <div>תת-קטגוריה</div>
                      <div>אחראי</div>
                      <div>סה״כ</div>
                      <div>פעילים</div>
                      <div></div>
                      <div></div>
                    </div>

                    {cards.map((c) => {
                      const active = c.items.filter((a: any) => a.status === "in_use" || a.current_owner_id).length;
                      const hasExpired = c.items.some((a: any) => {
                        const e = expiryOf(a, domain);
                        return e && new Date(e) < new Date();
                      });
                      return (
                        <RowContextMenu key={c.id} actions={subMenuActions(category, c)}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => { setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); }}
                          aria-label={`פתח תת-קטגוריה ${c.name}`}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedIds(new Set()); updateParams({ cat: category.id, sub: c.id }); }
                          }}
                          className="w-full min-w-[34rem] grid grid-cols-[1fr_7rem_5rem_6rem_2.5rem_2rem] gap-2 px-4 py-3 text-base border-t border-border hover:bg-muted/40 text-right items-center transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2 truncate">
                            {hasExpired && (
                              <span className="inline-flex shrink-0 text-destructive" title="יש פריטים פגי תוקף">
                                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                                <span className="sr-only">יש פריטים פגי תוקף</span>
                              </span>
                            )}
                            <span className={cn("truncate font-medium", c.id === NO_SUBCATEGORY_KEY && "text-muted-foreground")}>
                              {c.name}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.ownerRole ? OWNER_ROLE_LABEL[c.ownerRole] ?? c.ownerRole : "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{c.items.length}</div>
                          <div className="text-xs">{active} / {c.items.length}</div>
                          {c.id === NO_SUBCATEGORY_KEY ? <div /> : (
                            <IconButton
                              label={`מחק תת-קטגוריה ${c.name}`}
                              onClick={(e) => { e.stopPropagation(); handleDeleteGroup(c.id, c.name, c.items.length); }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 aria-hidden="true" />
                            </IconButton>
                          )}
                          <ArrowRight aria-hidden="true" className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                        </div>
                        </RowContextMenu>
                      );
                    })}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <MultiHandoverFlow
        open={handoverOpen}
        assets={drilledItems.filter((a: any) => selectedIds.has(a.id))}
        // Cancelling keeps the selection so the user can retry; only a completed handover clears it.
        onOpenChange={setHandoverOpen}
        onAssigned={() => setSelectedIds(new Set())}
      />


      <AddAssetDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) { setAddCategoryId(undefined); setAddGroupId(undefined); }
        }}
        defaultCategoryId={addCategoryId}
        defaultGroupId={addGroupId}
      />

      <Dialog open={!!renameTarget} onOpenChange={(o) => { if (!o) setRenameTarget(null); }}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">עריכת תת-קטגוריה</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRenameGroup(); }}
            placeholder="שם תת-הקטגוריה"
            aria-label="שם תת-הקטגוריה"
            dir="rtl"
            className="text-right"
            autoFocus
          />
          <DialogFooter className="gap-2 sm:justify-start">
            <Button onClick={handleRenameGroup} disabled={!renameName.trim() || updateGroup.isPending}>
              <Check className="w-4 h-4 ml-1" />
              שמירה
            </Button>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              <X className="w-4 h-4 ml-1" />
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!fieldsTargetId} onOpenChange={(o) => { if (!o) setFieldsTargetId(null); }}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">שדות בחלון — {fieldsGroup?.name}</DialogTitle>
          </DialogHeader>
          {fieldsGroup && <SubCategoryFieldsChecklist group={fieldsGroup} domain={domain as any} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const SubCategoryCard = React.forwardRef<HTMLDivElement, {
  card: SubCard;
  domain: DomainKey;
  isAssignable: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "onClick">>(function SubCategoryCard({
  card, domain, isAssignable, onClick, onDelete, onEdit, className: extraClass, ...rest
}, ref) {
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
    <div
      ref={ref}
      {...rest}
      role="button"
      tabIndex={0}
      onClick={onClick}
      aria-label={`פתח תת-קטגוריה ${card.name}`}
      onKeyDown={(e) => {
        // Only the card itself: Enter on the edit/delete buttons must not also open the card.
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      className={cn(
        "group relative bg-card border rounded-2xl p-4 text-center cursor-pointer",
        "hover:shadow-xl hover:-translate-y-1 hover:ring-2 active:scale-[0.98] transition-all duration-200",
        isUnassigned ? "border-dashed border-warning/50 hover:ring-warning/30" : cn("border-border", color.ring),
        "flex flex-col items-center gap-3 aspect-square justify-center",
        extraClass,
      )}
    >
      <span className="absolute top-2 right-2 text-[0.8125rem] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
        {total}
      </span>
      {hasExpired && (
        <span className="absolute top-2 left-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/15 text-destructive" title="יש פריטים פגי תוקף">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" />
          <span className="sr-only">יש פריטים פגי תוקף</span>
        </span>
      )}
      {onEdit && (
        <button
          type="button"
          title="ערוך תת-קטגוריה"
          aria-label={`ערוך תת-קטגוריה ${card.name}`}
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className={cn(
            "absolute bottom-1 left-11 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground",
            "hover:bg-muted hover:text-foreground transition-colors",
            "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Pencil className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          title="מחק תת-קטגוריה"
          aria-label={`מחק תת-קטגוריה ${card.name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className={cn(
            "absolute bottom-1 left-1 inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground",
            "hover:bg-destructive/10 hover:text-destructive transition-colors",
            "[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
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
          <div className="text-[0.8125rem] text-muted-foreground mt-0.5">
            אחראי: {OWNER_ROLE_LABEL[card.ownerRole] ?? card.ownerRole}
          </div>
        )}
      </div>
    </div>

  );
});

interface ColDef {
  key: string;
  label: string;
  render: (a: any) => React.ReactNode;
  sortVal: (a: any) => string | number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function fmtCustom(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "כן" : "לא";
  if (typeof v === "string" && DATE_RE.test(v)) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("en-GB");
  }
  return String(v);
}

function InstancesTable({
  items, domain, onSelect, selectable, selectedIds, onToggleSelect, onSelectAll, columnsKey,
}: {
  items: any[];
  domain: DomainKey;
  onSelect: (id: string) => void;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onSelectAll?: (ids: string[], checked: boolean) => void;
  columnsKey?: string;
}) {
  const isInsurance = domain === "insurance";
  const { data: nextPayments } = useNextInsurancePayments(domain === "insurance" ? (localStorage.getItem("activeCompanyId")) : null);
  const siteOf = (a: any): string => {
    const cf = a.custom_fields ?? {};
    const k = Object.keys(cf).find((key) => /^שיוך לאתר/.test(key.trim()));
    return (k ? fmtCustom(cf[k]) : "") || a.sites?.name || "";
  };
  const secondValue = (a: any) =>
    (domain === "digital"
      ? a.account_username
      : domain === "licenses"
        ? (a.custom_fields?.["ספק"] ?? a.manufacturer_model)
        : a.serial_number) ?? null;

  const expiryInfo = (a: any) => {
    const exp = expiryOf(a, domain);
    const days = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000) : null;
    const cls = days !== null && days < 0 ? "text-destructive" : "text-foreground";
    const txt = days === null || days > 30 ? null : days < 0 ? `פג לפני ${Math.abs(days)} ימים` : days === 0 ? "פג היום" : `בעוד ${days} ימים`;
    return { exp, cls, txt };
  };
  const dash = <span className="text-muted-foreground">—</span>;

  // All available columns: built-in + every custom field present in this list.
  const allCols = useMemo<ColDef[]>(() => {
    const cols: ColDef[] = [
      { key: "code", label: "קוד", render: (a) => <span dir="ltr">{a.asset_code ?? "—"}</span>, sortVal: (a) => a.asset_code ?? "" },
      { key: "name", label: "שם פריט", render: (a) => a.asset_name ?? "—", sortVal: (a) => a.asset_name ?? "" },
      {
        key: "second",
        label: domain === "digital" ? "שם משתמש" : domain === "licenses" ? "ספק" : "מס׳ סידורי",
        render: (a) => <span dir={domain === "digital" ? "ltr" : undefined}>{secondValue(a) ?? "—"}</span>,
        sortVal: (a) => secondValue(a) ?? "",
      },
      {
        key: "employee", label: "עובד / אתר",
        render: (a) => a.employees?.full_name ? (
          <EmployeeLink employeeId={a.current_owner_id} name={a.employees.full_name} />
        ) : a.sites?.name ? (
          <span className="inline-flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="truncate">{a.sites.name}{a.container?.asset_name ? ` · ${a.container.asset_name}` : ""}</span>
          </span>
        ) : dash,
        sortVal: (a) => a.employees?.full_name ?? a.sites?.name ?? "",
      },
      { key: "site", label: "אתר", render: (a) => siteOf(a) || dash, sortVal: siteOf },
      {
        key: "expiry", label: isInsurance ? "תוקף פוליסה" : "תפוגה",
        render: (a) => {
          const e = expiryInfo(a);
          return e.exp ? <span className={cn("inline-flex flex-col gap-1 tabular-nums", e.cls)}>
            <span dir="ltr">{formatDateDMY(e.exp)}</span>
            {e.txt && <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium", e.cls === "text-destructive" ? "border-destructive/30 bg-destructive/10" : "border-warning/40 bg-warning/10")}>
              <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />{e.txt}
            </span>}
          </span> : dash;
        },
        sortVal: (a) => { const e = expiryOf(a, domain); return e ? new Date(e).getTime() : Number.MAX_SAFE_INTEGER; },
      },
    ];
    if (isInsurance) {
      cols.push({
        key: "next_payment", label: "תשלום הבא",
        render: (a) => { const n = nextPayments?.get(a.id); return n ? <span className={cn(n.due_date < new Date().toISOString().slice(0, 10) && "text-destructive")}>{formatDateDMY(n.due_date)}{n.amount != null ? ` · ₪${Number(n.amount).toLocaleString()}` : ""}</span> : dash; },
        sortVal: (a) => { const n = nextPayments?.get(a.id); return n ? new Date(n.due_date).getTime() : Number.MAX_SAFE_INTEGER; },
      });
    }
    if (domain === "physical" || isInsurance) {
      cols.push({
        key: "status", label: "סטטוס",
        render: (a) => {
          if (isInsurance) {
            const s = insuranceStatus(a, domain);
            return <span className={cn("px-2 py-0.5 rounded-full", s.cls)}>{s.label}</span>;
          }
          return <span className={cn("px-2 py-0.5 rounded-full", assetStatusClasses[a.status])}>{assetStatusLabels[a.status] ?? a.status}</span>;
        },
        sortVal: (a) => isInsurance ? insuranceStatus(a, domain).label : (assetStatusLabels[a.status] ?? a.status ?? ""),
      });
    }
    const customKeys = new Set<string>();
    items.forEach((a) => Object.keys(a.custom_fields ?? {}).forEach((k) => {
      if (!/^שיוך לאתר/.test(k.trim())) customKeys.add(k);
    }));
    [...customKeys].sort((x, y) => x.localeCompare(y, "he")).forEach((k) => {
      cols.push({
        key: `cf:${k}`, label: k,
        render: (a) => fmtCustom(a.custom_fields?.[k]) || dash,
        sortVal: (a) => {
          const v = a.custom_fields?.[k];
          if (typeof v === "string" && DATE_RE.test(v)) return new Date(v).getTime();
          if (typeof v === "number") return v;
          return fmtCustom(v);
        },
      });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, domain, nextPayments]);

  const defaultKeys = useMemo(() => {
    if (isInsurance) return ["name", "site", "cf:חברת ביטוח", "expiry", "cf:שם סוכן ביטוח", "status"];
    const keys = ["code"];
    if (items.some((a) => !!secondValue(a))) keys.push("second");
    keys.push("employee");
    // Address-like custom field (e.g. real-estate "כתובת/תיאור הנכס").
    allCols.filter((c) => c.key.startsWith("cf:") && /כתובת/.test(c.label)).forEach((c) => keys.push(c.key));
    keys.push(domain === "physical" ? "status" : "expiry");
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCols, isInsurance, domain]);

  // Per-resource column choice, saved in this browser.
  const storeKey = `asset-cols:${columnsKey ?? domain}`;
  const [chosen, setChosenState] = useState<string[] | null>(() => {
    try { const raw = localStorage.getItem(storeKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [loadedKey, setLoadedKey] = useState(storeKey);
  if (loadedKey !== storeKey) {
    setLoadedKey(storeKey);
    try { const raw = localStorage.getItem(storeKey); setChosenState(raw ? JSON.parse(raw) : null); } catch { setChosenState(null); }
  }
  const setChosen = (next: string[] | null) => {
    setChosenState(next);
    try { if (next) localStorage.setItem(storeKey, JSON.stringify(next)); else localStorage.removeItem(storeKey); } catch { /* ignore */ }
  };
  const activeKeys = chosen ?? defaultKeys;
  const visibleCols = activeKeys.map((k) => allCols.find((c) => c.key === k)).filter(Boolean) as ColDef[];
  const toggleCol = (key: string) => {
    const base = activeKeys.filter((k) => allCols.some((c) => c.key === k));
    const next = base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    setChosen(next.length ? next : base);
  };

  const [colSort, setColSort] = usePersistentFilter<{ key: string; dir: "asc" | "desc" } | null>(
    `assets:${domain}:colsort`,
    null,
  );
  const sortCol = colSort ? allCols.find((c) => c.key === colSort.key) : null;
  const sorted = sortCol
    ? [...items].sort((a, b) => {
        const va = sortCol.sortVal(a);
        const vb = sortCol.sortVal(b);
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "he", { numeric: true });
        return colSort?.dir === "asc" ? cmp : -cmp;
      })
    : items;
  const toggleSort = (key: string) =>
    setColSort((prev) =>
      prev && prev.key === key
        ? (prev.dir === "asc" ? { key, dir: "desc" } : null)
        : { key, dir: "asc" },
    );

  const selectedCount = items.filter((a) => selectedIds?.has(a.id)).length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold tabular-nums">{items.length} פריטים</span>
          <span aria-live="polite" className="text-sm font-medium text-primary">
            {selectedCount > 0 ? `${selectedCount} נבחרו` : ""}
          </span>
        </div>
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-h-11">
              <Columns3 aria-hidden="true" />עמודות
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[60vh] w-64 overflow-y-auto text-right">
            <DropdownMenuLabel>עמודות להצגה</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {allCols.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.key}
                className="min-h-11"
                checked={activeKeys.includes(c.key)}
                onCheckedChange={() => toggleCol(c.key)}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onClick={() => setChosen(null)}>איפוס לברירת מחדל</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="max-h-[65vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" role="region" aria-label="טבלת פריטים" tabIndex={0}>
        <table className="w-full border-separate border-spacing-0 text-start text-base">
          <caption className="sr-only">פריטים — {DOMAIN_META[domain].title}</caption>
          <thead className="sticky top-0 z-10 bg-secondary text-secondary-foreground">
            <tr>
              {selectable && <th scope="col" className="w-14 border-b border-border px-4 py-3">
                <Checkbox
                  className="h-6 w-6"
                  aria-label="בחר את כל הפריטים המוצגים"
                  checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                  onCheckedChange={(checked) => onSelectAll?.(items.map((a) => a.id), checked === true)}
                />
              </th>}
              {visibleCols.map((c) => {
                const active = colSort?.key === c.key;
                return <th key={c.key} scope="col" aria-sort={active ? (colSort?.dir === "asc" ? "ascending" : "descending") : "none"} className="min-w-40 border-b border-border px-4 py-2 text-start">
                  <Button variant="ghost" onClick={() => toggleSort(c.key)} aria-label={`מיון לפי ${c.label}`} className={cn("min-h-11 justify-start px-2 text-sm font-semibold", active && "bg-accent text-accent-foreground")}>
                    {c.label}
                    {active ? (colSort?.dir === "asc" ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />) : <ChevronsUpDown aria-hidden="true" className="text-muted-foreground" />}
                  </Button>
                </th>;
              })}
              <th scope="col" className="w-16 border-b border-border px-3"><span className="sr-only">פתיחת פריט</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((a: any, index) => {
              const label = a.asset_name || a.asset_code || "פריט";
              const selected = selectedIds?.has(a.id) ?? false;
              return <RowContextMenu key={a.id} actions={[
                { label: "פתח כרטיס פריט", onSelect: () => onSelect(a.id) },
                { label: "פתח בלשונית חדשה", onSelect: () => openInNewTab(`/assets/${domainKeyToSlug(domain)}/${a.id}`) },
                ...(onToggleSelect ? [{ label: selected ? "בטל בחירה" : "בחר לפעולה מרובה", onSelect: () => onToggleSelect(a.id) }] : []),
                copyAction("העתק קוד", a.asset_code, true),
                copyAction("העתק מס' סידורי", a.serial_number),
                copyAction("העתק מס' רישוי", a.license_plate),
                copyAction("העתק שם", a.asset_name),
              ]}>
                <tr onClick={() => onSelect(a.id)} className={cn("group cursor-pointer transition-colors hover:bg-accent/60 focus-within:bg-accent/60", selected ? "bg-primary/10" : index % 2 ? "bg-muted/30" : "bg-card")}>
                  {selectable && <td className="border-b border-border px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <Checkbox className="h-6 w-6" aria-label={`בחר ${label}`} checked={selected} onCheckedChange={() => onToggleSelect?.(a.id)} />
                  </td>}
                  {visibleCols.map((c, i) => (
                    <td key={c.key} className={cn("min-w-40 max-w-96 border-b border-border px-6 py-4 align-middle leading-7", i === 0 && "font-medium", c.key === "code" && "tabular-nums")}>
                      <div className="whitespace-normal break-words" onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) e.stopPropagation(); }}>
                        {c.render(a)}
                      </div>
                    </td>
                  ))}
                  <td className="border-b border-border px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-11 w-11 text-primary" aria-label={`פתח כרטיס ${label}`} title={`פתח כרטיס ${label}`} onClick={() => onSelect(a.id)}>
                      <ArrowRight aria-hidden="true" className="rtl:rotate-180" />
                    </Button>
                  </td>
                </tr>
              </RowContextMenu>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
