import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus, GripVertical, Trash2, Save, Pencil, Search,
  Type, Hash, Calendar, List, ListChecks, Settings2, Check, X, ChevronLeft, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssetCategories } from "@/hooks/useData";
import { useCategoryFields, useCreateCategory, useUpdateCategory, useSaveCategoryFields, useDeleteCategory } from "@/hooks/useCategories";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DOMAIN_ORDER, DOMAIN_META, DOMAIN_DEFAULTS, getDomain, type DomainKey } from "@/lib/assetDomains";
import { OWNER_ROLE_OPTIONS, getAllDomainLabels, type DomainLabels } from "@/lib/domainConfig";
import { useCreateAssetGroup, useAssetGroups, useDeleteAssetGroup, useMoveAssetGroup, useUpdateAssetGroup } from "@/hooks/useAssetGroups";
import { useCompany } from "@/hooks/useCompany";

type FieldType = "text" | "number" | "date" | "list" | "list_multi";

interface LocalField {
  id?: string;
  tempId: string;
  field_name: string;
  field_type: FieldType;
  is_required: boolean;
  field_options: string[] | null;
  sort_order: number;
  /** null = applies to all sub-categories of the category */
  group_id: string | null;
}

const fieldTypeIcons: Record<FieldType, typeof Type> = {
  text: Type,
  number: Hash,
  date: Calendar,
  list: List,
  list_multi: ListChecks,
};

const fieldTypeLabels: Record<FieldType, string> = {
  text: "טקסט",
  number: "מספר",
  date: "תאריך",
  list: "רשימה (בחירה אחת)",
  list_multi: "רשימה (בחירה מרובה)",
};

export default function CategoryManager() {
  const { data: allCategories, isLoading } = useAssetCategories();
  const { isLegal, isAdmin, isSuperAdmin, isOperations } = useAuth();
  const legalOnly = isLegal && !isAdmin && !isSuperAdmin && !isOperations;
  const categories = useMemo(() => {
    if (!allCategories) return allCategories;
    return legalOnly ? allCategories.filter((c: any) => c.is_assignable === false) : allCategories;
  }, [allCategories, legalOnly]);

  const { activeCompany } = useCompany();
  const labels = useMemo(
    () => getAllDomainLabels((activeCompany?.domain_labels ?? null) as DomainLabels | null),
    [activeCompany?.domain_labels]
  );


  const [searchParams] = useSearchParams();
  const focusDomain = searchParams.get("domain") as DomainKey | null;
  const [selectedDomain, setSelectedDomain] = useState<DomainKey>(
    focusDomain && DOMAIN_ORDER.includes(focusDomain) ? focusDomain : "physical"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatDomain, setNewCatDomain] = useState<DomainKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; assetCount: number } | null>(null);
  const { data: groups } = useAssetGroups();

  // Focus the requested domain when arriving from the domain card "quick edit" button
  useEffect(() => {
    if (focusDomain && DOMAIN_ORDER.includes(focusDomain)) {
      setSelectedDomain(focusDomain);
    }
  }, [focusDomain]);
  const { toast } = useToast();
  const deleteMutation = useDeleteCategory();

  // Group categories by domain
  const byDomain = useMemo(() => {
    const out: Record<DomainKey, any[]> = {
      physical: [], digital: [], licenses: [], training: [], insurance: [], real_estate: [],
    };
    for (const c of categories ?? []) out[getDomain(c)].push(c);
    return out;
  }, [categories]);

  const selectedCategory = useMemo(
    () => (categories ?? []).find((category: any) => category.id === selectedId) ?? null,
    [categories, selectedId],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase("he");
  const visibleCategories = useMemo(() => {
    const domainCategories = byDomain[selectedDomain] ?? [];
    if (!normalizedSearch) return domainCategories;
    return domainCategories.filter((category: any) => {
      const categoryMatches = `${category.category_name} ${category.prefix ?? ""}`.toLocaleLowerCase("he").includes(normalizedSearch);
      const groupMatches = (groups ?? []).some((group) =>
        group.category_id === category.id && group.name.toLocaleLowerCase("he").includes(normalizedSearch)
      );
      return categoryMatches || groupMatches;
    });
  }, [byDomain, selectedDomain, normalizedSearch, groups]);

  useEffect(() => {
    if (selectedCategory && getDomain(selectedCategory) === selectedDomain) return;
    const firstCategory = byDomain[selectedDomain]?.[0];
    setSelectedId(firstCategory?.id ?? null);
  }, [selectedDomain, byDomain, selectedCategory]);

  const handleDeleteClick = (e: React.MouseEvent, cat: any) => {
    e.stopPropagation();
    setDeleteTarget({
      id: cat.id,
      name: cat.category_name,
      assetCount: cat.assets?.[0]?.count ?? 0,
    });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "הקטגוריה נמחקה" });
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "לא ניתן למחוק", description: err.message, variant: "destructive" });
    }
  };

  const openNewInDomain = (k: DomainKey | null) => {
    setNewCatDomain(k);
    setNewCatOpen(true);
  };

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="page-header">
          <h1 className="page-title">ניהול דומיינים וקטגוריות</h1>
          <p className="page-subtitle">דומיין ← קטגוריה ← תת-קטגוריה, במקום אחד</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="חיפוש קטגוריה או תת-קטגוריה..." aria-label="חיפוש בהיררכיה" className="w-full h-10 pr-10 pl-3 rounded-lg border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/25" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <>
          <section className="bg-card border border-border rounded-lg overflow-hidden shadow-card">
            <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x lg:divide-x-reverse lg:divide-border min-h-[430px] max-h-[64vh]">
              <HierarchyColumn title={`דומיינים (${DOMAIN_ORDER.length})`}>
                {DOMAIN_ORDER.map((key) => {
                  const meta = DOMAIN_META[key];
                  const Icon = meta.icon;
                  const categoryCount = byDomain[key]?.length ?? 0;
                  const groupCount = (groups ?? []).filter((group) => byDomain[key]?.some((category: any) => category.id === group.category_id)).length;
                  return (
                    <Button key={key} variant="ghost" onClick={() => setSelectedDomain(key)} className={cn("w-full h-auto min-h-14 justify-start gap-3 px-3 py-2.5 border", selectedDomain === key ? "border-primary bg-primary/10" : "border-border bg-background")}>
                      <span className={cn("w-9 h-9 rounded-md flex items-center justify-center shrink-0", meta.color.bg, meta.color.text)}><Icon className="w-4.5 h-4.5" /></span>
                      <span className="min-w-0 flex-1 text-right"><span className="block text-sm font-semibold truncate">{labels[key].title}</span><span className="block text-[11px] font-normal text-muted-foreground">{categoryCount} קטגוריות · {groupCount} תתי-קטגוריות</span></span>
                      <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  );
                })}
              </HierarchyColumn>
              <HierarchyColumn title={`קטגוריות ב${labels[selectedDomain].title}`} action={<Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openNewInDomain(selectedDomain)} title="קטגוריה חדשה"><Plus className="w-4 h-4" /></Button>}>
                {visibleCategories.length === 0 ? <EmptyHierarchy text="לא נמצאו קטגוריות" /> : visibleCategories.map((category: any) => {
                  const active = selectedId === category.id;
                  const groupCount = (groups ?? []).filter((group) => group.category_id === category.id).length;
                  return (
                    <div key={category.id} className={cn("flex items-center gap-1 rounded-md border p-1", active ? "border-primary bg-primary/10" : "border-border bg-background")}>
                      <Button variant="ghost" onClick={() => setSelectedId(category.id)} className="h-auto min-h-12 flex-1 justify-start px-2 text-right"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{category.category_name}</span><span className="block text-[11px] font-normal text-muted-foreground"><span className="font-mono">{category.prefix}</span> · {groupCount} תתי-קטגוריות · {category.assets?.[0]?.count ?? 0} פריטים</span></span><ChevronLeft className="w-4 h-4 text-muted-foreground" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="מחק קטגוריה" onClick={(event) => handleDeleteClick(event, category)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  );
                })}
              </HierarchyColumn>
              <HierarchyColumn title={selectedCategory ? `תתי-קטגוריות ב${selectedCategory.category_name}` : "תתי-קטגוריות"}>
                {selectedCategory ? <SubCategoryColumn category={selectedCategory} categories={categories ?? []} groups={groups ?? []} search={normalizedSearch} /> : <EmptyHierarchy text="בחר קטגוריה כדי להציג תתי-קטגוריות" />}
              </HierarchyColumn>
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center gap-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{labels[selectedDomain].title}</span><ChevronLeft className="w-3.5 h-3.5" /><span className="font-medium text-foreground">{selectedCategory?.category_name ?? "בחר קטגוריה"}</span></div>
          </section>
          {selectedCategory && <section className="space-y-4 pt-1"><div><h2 className="text-base font-semibold">הגדרות הקטגוריה</h2><p className="text-xs text-muted-foreground">פרטים, התנהגות ושדות מותאמים עבור {selectedCategory.category_name}</p></div><CategoryEditor category={selectedCategory} /><FieldsEditor categoryId={selectedCategory.id} categoryName={selectedCategory.category_name} /></section>}
        </>

      )}

      <NewCategoryDialog
        open={newCatOpen}
        onOpenChange={setNewCatOpen}
        lockedDomain={newCatDomain}
        forceInstitutional={legalOnly}
        onCreated={(id) => {
          setSelectedId(id);
          setNewCatOpen(false);
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת קטגוריה</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.assetCount > 0 ? (
                <>
                  הקטגוריה <strong>{deleteTarget.name}</strong> מכילה {deleteTarget.assetCount} פריטים.
                  <br />
                  יש להעביר או למחוק את הפריטים תחילה.
                </>
              ) : (
                <>האם למחוק את הקטגוריה <strong>{deleteTarget?.name}</strong>? פעולה זו תמחק גם את השדות המותאמים שלה ואינה הפיכה.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            {deleteTarget && deleteTarget.assetCount === 0 && (
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                מחק
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HierarchyColumn({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="min-w-0 flex flex-col overflow-hidden border-b lg:border-b-0 border-border"><div className="h-12 px-4 border-b border-border bg-muted/35 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground truncate">{title}</span>{action}</div><div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-40">{children}</div></div>;
}

function EmptyHierarchy({ text }: { text: string }) {
  return <div className="h-28 flex items-center justify-center text-center text-xs text-muted-foreground border border-dashed border-border rounded-md px-4">{text}</div>;
}

function SubCategoryColumn({ category, categories, groups, search }: { category: any; categories: any[]; groups: any[]; search: string }) {
  const createGroup = useCreateAssetGroup();
  const updateGroup = useUpdateAssetGroup();
  const deleteGroup = useDeleteAssetGroup();
  const moveGroup = useMoveAssetGroup();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const categoryGroups = groups.filter((group) => group.category_id === category.id && (!search || group.name.toLocaleLowerCase("he").includes(search)));
  const create = async () => { if (!newName.trim()) return; try { await createGroup.mutateAsync({ category_id: category.id, name: newName.trim(), default_owner_role: category.default_owner_role ?? null, company_id: category.company_id ?? null }); setNewName(""); toast({ title: "תת-הקטגוריה נוצרה" }); } catch (error: any) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); } };
  const rename = async (id: string) => { if (!editName.trim()) return; try { await updateGroup.mutateAsync({ id, name: editName.trim() }); setEditingId(null); toast({ title: "תת-הקטגוריה עודכנה" }); } catch (error: any) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); } };
  const remove = async (id: string, name: string) => { if (!window.confirm(`למחוק את תת-הקטגוריה "${name}"? הפריטים יישארו ללא תת-קטגוריה.`)) return; try { await deleteGroup.mutateAsync(id); toast({ title: "תת-הקטגוריה נמחקה" }); } catch (error: any) { toast({ title: "שגיאה", description: error.message, variant: "destructive" }); } };
  return <>
    <div className="flex gap-2 pb-1"><input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && create()} placeholder="שם תת-קטגוריה חדשה" className="min-w-0 flex-1 h-9 px-3 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/25" /><Button size="icon" className="h-9 w-9 shrink-0" onClick={create} disabled={!newName.trim() || createGroup.isPending} title="הוסף תת-קטגוריה"><Plus className="w-4 h-4" /></Button></div>
    {categoryGroups.length === 0 ? <EmptyHierarchy text="אין עדיין תתי-קטגוריות" /> : categoryGroups.map((group) => {
      const assetCount = category.assets?.filter?.((asset: any) => asset.group_id === group.id).length ?? 0;
      return <div key={group.id} className="rounded-md border border-border bg-background p-3 space-y-2">
        {editingId === group.id ? <div className="flex gap-1"><input autoFocus value={editName} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && rename(group.id)} className="min-w-0 flex-1 h-8 px-2 rounded border border-border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/25" /><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => rename(group.id)}><Check className="w-4 h-4" /></Button><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button></div> : <div className="flex items-center gap-1"><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{group.name}</p><p className="text-[11px] text-muted-foreground">{assetCount} פריטים · {OWNER_ROLE_OPTIONS.find((option) => option.value === group.default_owner_role)?.label ?? "אחראי מהקטגוריה"}</p></div><Button size="icon" variant="ghost" className="h-8 w-8" title="ערוך שם" onClick={() => { setEditingId(group.id); setEditName(group.name); }}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="מחק" onClick={() => remove(group.id, group.name)}><Trash2 className="w-3.5 h-3.5" /></Button></div>}
        <div className="grid grid-cols-2 gap-2"><select value={group.default_owner_role ?? ""} onChange={(event) => updateGroup.mutate({ id: group.id, default_owner_role: event.target.value || null })} aria-label={`אחראי עבור ${group.name}`} className="min-w-0 h-8 px-2 rounded border border-border bg-muted/40 text-[11px] outline-none"><option value="">אחראי מהקטגוריה</option>{OWNER_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={category.id} onChange={(event) => moveGroup.mutate({ groupId: group.id, categoryId: event.target.value })} aria-label={`העבר את ${group.name}`} className="min-w-0 h-8 px-2 rounded border border-border bg-muted/40 text-[11px] outline-none">{DOMAIN_ORDER.map((domain) => <optgroup key={domain} label={DOMAIN_META[domain].title}>{categories.filter((item) => getDomain(item) === domain).map((item) => <option key={item.id} value={item.id}>{item.category_name}</option>)}</optgroup>)}</select></div>
      </div>;
    })}
  </>;
}

// ============================
// Quick inline category edit (from accordion row)
// ============================
function QuickCategoryEdit({
  category,
  onClose,
  updateMutation,
  createGroupMutation,
}: {
  category: any;
  onClose: () => void;
  updateMutation: ReturnType<typeof useUpdateCategory>;
  createGroupMutation: ReturnType<typeof useCreateAssetGroup>;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(category.category_name);
  const [prefix, setPrefix] = useState(category.prefix);
  const [description, setDescription] = useState(category.description ?? "");
  const [domain, setDomain] = useState<DomainKey>(getDomain(category));
  const [ownerRole, setOwnerRole] = useState<string>(category.default_owner_role ?? "");
  const [newSubName, setNewSubName] = useState("");
  const { data: allGroups } = useAssetGroups();
  const deleteGroupMutation = useDeleteAssetGroup();
  const subGroups = useMemo(
    () => (allGroups ?? []).filter((g: any) => g.category_id === category.id),
    [allGroups, category.id],
  );

  const handleDeleteSub = async (id: string, subName: string) => {
    if (!window.confirm(`למחוק את תת-הקטגוריה "${subName}"? הפריטים יוסרו ממנה אך לא יימחקו.`)) return;
    try {
      await deleteGroupMutation.mutateAsync(id);
      toast({ title: "תת-הקטגוריה נמחקה" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };


  const handleSave = async () => {
    if (!name.trim() || !prefix.trim()) {
      toast({ title: "שגיאה", description: "שם וקידומת הם שדות חובה", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        category_name: name,
        prefix: prefix.toUpperCase(),
        description: description || undefined,
        domain,
        default_owner_role: ownerRole || undefined,
      });
      toast({ title: "הקטגוריה עודכנה" });
      onClose();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const handleCreateSub = async () => {
    const trimmed = newSubName.trim();
    if (!trimmed) return;
    try {
      await createGroupMutation.mutateAsync({
        category_id: category.id,
        name: trimmed,
        default_owner_role: category.default_owner_role ?? null,
        company_id: category.company_id ?? null,
      });
      setNewSubName("");
      toast({ title: "תת-הקטגוריה נוצרה" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="mx-1 mb-2 p-3 rounded-lg border border-primary/30 bg-muted/30 space-y-2 animate-fade-in">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם"
          className="px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30"
        />
        <input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 4))}
          placeholder="קידומת"
          className="px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30 font-mono uppercase"
          dir="ltr"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="תיאור"
        className="w-full px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30"
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">העבר דומיין</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainKey)}
            className="w-full px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30"
          >
            {DOMAIN_ORDER.map((k) => (
              <option key={k} value={k}>{DOMAIN_META[k].title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground mb-1 block">אחראי ברירת מחדל</label>
          <select
            value={ownerRole}
            onChange={(e) => setOwnerRole(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30"
          >
            <option value="">ללא</option>
            {OWNER_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button size="sm" variant="outline" onClick={onClose}>
          <X className="w-3.5 h-3.5 ml-1" />ביטול
        </Button>
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Check className="w-3.5 h-3.5 ml-1" />{updateMutation.isPending ? "שומר..." : "שמור"}
        </Button>
      </div>

      {subGroups.length > 0 && (
        <div className="pt-2 border-t border-border/50 space-y-1">
          <div className="text-[11px] text-muted-foreground">תת-קטגוריות קיימות</div>
          {subGroups.map((g: any) => (
            <div key={g.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-background rounded-md border border-border/50">
              <span className="flex-1 truncate text-sm">{g.name}</span>
              <button
                type="button"
                title="מחק תת-קטגוריה"
                onClick={() => handleDeleteSub(g.id, g.name)}
                disabled={deleteGroupMutation.isPending}
                className="text-muted-foreground hover:text-destructive p-1 rounded-md disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-border/50">

        <input
          value={newSubName}
          onChange={(e) => setNewSubName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateSub()}
          placeholder="תת-קטגוריה חדשה"
          className="flex-1 px-2.5 py-1.5 bg-background rounded-md text-sm outline-none border border-dashed border-border/60 focus:ring-1 focus:ring-primary/30"
        />
        <Button size="sm" variant="outline" onClick={handleCreateSub} disabled={!newSubName.trim() || createGroupMutation.isPending}>
          <Plus className="w-3.5 h-3.5 ml-1" />תת-קטגוריה חדשה
        </Button>
      </div>
    </div>
  );
}

// ============================
// Fields Editor with Drag & Drop
// ============================
function FieldsEditor({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { data: dbFields, isLoading } = useCategoryFields(categoryId);
  const { data: allGroups } = useAssetGroups();
  const groups = useMemo(
    () => (allGroups ?? []).filter((g: any) => g.category_id === categoryId),
    [allGroups, categoryId],
  );
  const saveMutation = useSaveCategoryFields();
  const { toast } = useToast();
  const [fields, setFields] = useState<LocalField[]>([]);
  const [dirty, setDirty] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Sync from DB
  useEffect(() => {
    if (dbFields) {
      setFields(
        dbFields.map((f) => ({
          id: f.id,
          tempId: f.id,
          field_name: f.field_name,
          field_type: f.field_type as FieldType,
          is_required: f.is_required,
          field_options: Array.isArray(f.field_options) ? (f.field_options as string[]) : null,
          sort_order: f.sort_order,
          group_id: (f as any).group_id ?? null,
        }))
      );
      setDirty(false);
    }
  }, [dbFields]);

  const addField = () => {
    const newField: LocalField = {
      tempId: crypto.randomUUID(),
      field_name: "",
      field_type: "text",
      is_required: false,
      field_options: null,
      sort_order: fields.length,
      group_id: null,
    };
    setFields([...fields, newField]);
    setDirty(true);
  };

  const updateField = (tempId: string, updates: Partial<LocalField>) => {
    setFields(fields.map(f => f.tempId === tempId ? { ...f, ...updates } : f));
    setDirty(true);
  };

  const removeField = (tempId: string) => {
    setFields(fields.filter(f => f.tempId !== tempId));
    setDirty(true);
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const reordered = [...fields];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setFields(reordered.map((f, i) => ({ ...f, sort_order: i })));
    dragItem.current = null;
    dragOverItem.current = null;
    setDirty(true);
  };

  const handleSave = async () => {
    // Validate
    const emptyNames = fields.some(f => !f.field_name.trim());
    if (emptyNames) {
      toast({ title: "שגיאה", description: "כל השדות חייבים לכלול שם", variant: "destructive" });
      return;
    }

    try {
      await saveMutation.mutateAsync({
        categoryId,
        fields: fields.map((f, i) => ({
          id: f.id,
          field_name: f.field_name,
          field_type: f.field_type,
          is_required: f.is_required,
          field_options: f.field_options,
          sort_order: i,
          group_id: f.group_id,
        })),
      });
      setDirty(false);
      toast({ title: "נשמר בהצלחה" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">טוען שדות...</div>;
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card animate-fade-in">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{categoryName}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fields.length} שדות מותאמים • גרור לסידור מחדש
            {groups.length > 0 && " • ניתן להגביל שדה לתת-קטגוריה"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-warning bg-warning/10 px-2 py-1 rounded-md">
              שינויים לא שמורים
            </span>
          )}
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saveMutation.isPending || !dirty}>
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>

      <div className="p-5 space-y-2">
        {fields.map((field, index) => (
          <div
            key={field.tempId}
            onDragEnter={() => handleDragEnter(index)}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-background",
              "hover:border-primary/30 transition-all group"
            )}
          >
            {/* Drag handle */}
            <div
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragEnd={handleDragEnd}
              className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            {/* Field name */}
            <input
              value={field.field_name}
              onChange={(e) => updateField(field.tempId, { field_name: e.target.value })}
              placeholder="שם השדה"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 min-w-0"
            />

            {/* Field type selector */}
            <div className="flex items-center gap-1 shrink-0">
              {(Object.keys(fieldTypeIcons) as FieldType[]).map((type) => {
                const Icon = fieldTypeIcons[type];
                return (
                  <button
                    key={type}
                    onClick={() => {
                      updateField(field.tempId, {
                        field_type: type,
                        field_options: (type === "list" || type === "list_multi") ? [""] : null,
                      });
                    }}
                    title={fieldTypeLabels[type]}
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center transition-colors",
                      field.field_type === type
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                );
              })}
            </div>

            {/* Sub-category scope */}
            {groups.length > 0 && (
              <select
                value={field.group_id ?? ""}
                onChange={(e) => updateField(field.tempId, { group_id: e.target.value || null })}
                title="הצג שדה זה רק בתת-קטגוריה נבחרת"
                className={cn(
                  "shrink-0 max-w-[150px] text-xs rounded-md px-2 py-1 outline-none border transition-colors",
                  field.group_id
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted text-muted-foreground border-transparent",
                )}
              >
                <option value="">כל תתי-הקטגוריות</option>
                {groups.map((g: any) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            )}

            {/* Required toggle */}
            <button
              onClick={() => updateField(field.tempId, { is_required: !field.is_required })}
              title={field.is_required ? "שדה חובה" : "שדה רשות"}
              className={cn(
                "text-xs px-2 py-1 rounded-md font-medium transition-colors shrink-0",
                field.is_required
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {field.is_required ? "חובה" : "רשות"}
            </button>

            {/* Delete */}
            <button
              onClick={() => removeField(field.tempId)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {/* List options editor for selected list fields */}
        {fields.filter(f => f.field_type === "list" || f.field_type === "list_multi").map((field) => (
          <div key={`opts-${field.tempId}`} className="mr-7 p-3 rounded-lg border border-dashed border-border bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              אפשרויות {field.field_type === "list_multi" ? "(בחירה מרובה) " : ""}עבור "{field.field_name || "ללא שם"}"
            </p>
            {(field.field_options ?? [""]).map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...(field.field_options ?? [""])];
                    newOpts[oi] = e.target.value;
                    updateField(field.tempId, { field_options: newOpts });
                  }}
                  placeholder={`אפשרות ${oi + 1}`}
                  className="flex-1 bg-background rounded-md px-3 py-1.5 text-sm outline-none border border-border/50 focus:ring-1 focus:ring-primary/30"
                />
                <button
                  onClick={() => {
                    const newOpts = (field.field_options ?? [""]).filter((_, i) => i !== oi);
                    updateField(field.tempId, { field_options: newOpts.length ? newOpts : [""] });
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => {
                updateField(field.tempId, { field_options: [...(field.field_options ?? [""]), ""] });
              }}
              className="text-xs text-primary hover:underline"
            >
              + הוסף אפשרות
            </button>
          </div>
        ))}

        {/* Add field button */}
        <button
          onClick={addField}
          className="w-full py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 text-muted-foreground hover:text-primary flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          הוסף שדה חדש
        </button>
      </div>

      {/* Preview */}
      {fields.length > 0 && (
        <div className="p-5 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-3">תצוגה מקדימה של הטופס:</p>
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={`preview-${field.tempId}`} className="space-y-1">
                <label className="text-xs font-medium">
                  {field.field_name || "ללא שם"}
                  {field.is_required && <span className="text-destructive mr-1">*</span>}
                  {field.group_id && (
                    <span className="text-[10px] text-primary mr-1">
                      ({groups.find((g: any) => g.id === field.group_id)?.name})
                    </span>
                  )}
                </label>
                {field.field_type === "list" ? (
                  <select className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none" disabled>
                    <option>בחר...</option>
                    {(field.field_options ?? []).filter(Boolean).map((o, i) => (
                      <option key={i}>{o}</option>
                    ))}
                  </select>
                ) : field.field_type === "list_multi" ? (
                  <div className="w-full bg-muted rounded-md px-3 py-2 text-sm flex flex-wrap gap-1 min-h-[38px] opacity-70">
                    {(field.field_options ?? []).filter(Boolean).slice(0, 3).map((o, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-background text-xs border border-border/50">☐ {o}</span>
                    ))}
                    {(!field.field_options || field.field_options.filter(Boolean).length === 0) && (
                      <span className="text-muted-foreground text-xs">בחר אפשרויות (אחת או יותר)...</span>
                    )}
                  </div>
                ) : (
                  <input
                    type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
                    placeholder={fieldTypeLabels[field.field_type]}
                    className="w-full bg-muted rounded-md px-3 py-2 text-sm outline-none"
                    disabled
                    dir={field.field_type === "date" || field.field_type === "number" ? "ltr" : "rtl"}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================
// Category Editor (name, prefix, description)
// ============================
function CategoryEditor({ category }: { category: { id: string; category_name: string; prefix: string; description?: string | null; skip_handover_form?: boolean | null; skip_return_form?: boolean | null; default_notification_days_before?: number | null; is_assignable?: boolean | null; domain?: string | null; default_owner_role?: string | null; company_id?: string | null } }) {
  const updateMutation = useUpdateCategory();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.category_name);
  const [prefix, setPrefix] = useState(category.prefix);
  const [description, setDescription] = useState(category.description ?? "");
  const [isAssignable, setIsAssignable] = useState(category.is_assignable !== false);
  const [skipHandover, setSkipHandover] = useState(!!category.skip_handover_form);
  const [skipReturn, setSkipReturn] = useState(!!category.skip_return_form);
  const [notifDays, setNotifDays] = useState<string>(
    category.default_notification_days_before == null ? "" : String(category.default_notification_days_before)
  );
  const [domain, setDomain] = useState<DomainKey>(getDomain(category));
  const [ownerRole, setOwnerRole] = useState<string>(category.default_owner_role ?? "");

  useEffect(() => {
    setName(category.category_name);
    setPrefix(category.prefix);
    setDescription(category.description ?? "");
    setIsAssignable(category.is_assignable !== false);
    setSkipHandover(!!category.skip_handover_form);
    setSkipReturn(!!category.skip_return_form);
    setNotifDays(category.default_notification_days_before == null ? "" : String(category.default_notification_days_before));
    setDomain(getDomain(category));
    setOwnerRole(category.default_owner_role ?? "");
    setEditing(false);
  }, [category.id, category.category_name, category.prefix, category.description, category.is_assignable, category.skip_handover_form, category.skip_return_form, category.default_notification_days_before, category.domain, category.default_owner_role]);

  const handleSave = async () => {
    if (!name.trim() || !prefix.trim()) {
      toast({ title: "שגיאה", description: "שם וקידומת הם שדות חובה", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: category.id,
        category_name: name,
        prefix: prefix.toUpperCase(),
        description: description || undefined,
        is_assignable: isAssignable,
        // Institutional categories never use handover/return forms
        skip_handover_form: isAssignable ? skipHandover : true,
        skip_return_form: isAssignable ? skipReturn : true,
        default_notification_days_before: notifDays.trim() === "" ? null : Number(notifDays),
        domain,
        default_owner_role: ownerRole || undefined,
      });
      toast({ title: "קטגוריה עודכנה בהצלחה" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const [groupsOpen, setGroupsOpen] = useState(false);

  if (!editing) {
    return (
      <>
        <div className="bg-card rounded-xl border border-border/50 shadow-card p-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold">{category.category_name}</h2>
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full font-medium",
                category.is_assignable === false
                  ? "bg-primary/10 text-primary"
                  : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              )}>
                {category.is_assignable === false ? "נכס מוסדי" : "מוקצה לעובדים"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              קידומת: <span className="font-mono">{category.prefix}</span>
              {category.description && ` • ${category.description}`}
            </p>
            {category.is_assignable !== false && (category.skip_handover_form || category.skip_return_form) && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {category.skip_handover_form && "ללא אישור משיכה"}
                {category.skip_handover_form && category.skip_return_form && " • "}
                {category.skip_return_form && "ללא אישור זיכוי"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setGroupsOpen(true)}>
              <Users className="w-3.5 h-3.5" />
              תת-קטגוריות
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="w-3.5 h-3.5" />
              ערוך
            </Button>
          </div>
        </div>
        <ManageGroupsDialog
          open={groupsOpen}
          onOpenChange={setGroupsOpen}
          categoryId={category.id}
          categoryName={category.category_name}
          companyId={category.company_id ?? null}
          domain={getDomain(category as any)}
        />

      </>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-primary/30 shadow-card p-5 space-y-3 animate-fade-in">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">שם הקטגוריה</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">קידומת</label>
          <input value={prefix} onChange={e => setPrefix(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 3))}
            className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono uppercase" dir="ltr" maxLength={3} />
        </div>
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">תיאור</label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור קצר..."
          className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium mb-1 block">העבר דומיין</label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value as DomainKey)}
            className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            {DOMAIN_ORDER.map((k) => (
              <option key={k} value={k}>{DOMAIN_META[k].title}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">אחראי ברירת מחדל</label>
          <select
            value={ownerRole}
            onChange={(e) => setOwnerRole(e.target.value)}
            className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">ללא</option>
            {OWNER_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border/50">
        <p className="text-xs font-medium text-muted-foreground">סוג הקטגוריה</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsAssignable(true)}
            className={cn(
              "text-right p-3 rounded-lg border transition-all",
              isAssignable
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-border hover:border-primary/40"
            )}
          >
            <div className="text-sm font-medium">מוקצה לעובדים</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              פריטים ניתנים לשיוך לעובד, עם טופסי מסירה/החזרה.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setIsAssignable(false)}
            className={cn(
              "text-right p-3 rounded-lg border transition-all",
              !isAssignable
                ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                : "border-border hover:border-primary/40"
            )}
          >
            <div className="text-sm font-medium">נכסים מוסדיים</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              פריטי החברה ללא שיוך לעובד (לדוגמה: ביטוחים, רישיונות).
            </div>
          </button>
        </div>
      </div>

      {isAssignable && (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <p className="text-xs font-medium text-muted-foreground">הגדרות טופסי מסירה/החזרה</p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipHandover}
              onChange={(e) => setSkipHandover(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
            />
            <div className="text-sm">
              <div>דלג על אישור משיכה</div>
              <div className="text-[11px] text-muted-foreground">פריטים בקטגוריה זו ישויכו לעובד ישירות, ללא טופס מסירה וחתימה.</div>
            </div>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipReturn}
              onChange={(e) => setSkipReturn(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
            />
            <div className="text-sm">
              <div>דלג על אישור זיכוי</div>
              <div className="text-[11px] text-muted-foreground">החזרת פריטים בקטגוריה זו למלאי תתבצע ללא טופס החזרה וחתימה.</div>
            </div>
          </label>
        </div>
      )}

      <div className="pt-2 border-t border-border/50">
        <label className="text-sm font-medium mb-1 block">ימי התראה ברירת מחדל לתפוגה</label>
        <input
          type="number"
          min={0}
          max={365}
          value={notifDays}
          onChange={(e) => setNotifDays(e.target.value)}
          placeholder="14"
          className="w-full px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          dir="ltr"
        />
        <p className="text-[11px] text-muted-foreground mt-1">
          מספר הימים לפני תאריך תפוגה שבו יישלח מייל התראה. השאר ריק = 14 ימים.
        </p>
      </div>

      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
          <X className="w-3.5 h-3.5 ml-1" />ביטול
        </Button>
        <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
          <Check className="w-3.5 h-3.5 ml-1" />{updateMutation.isPending ? "שומר..." : "שמור"}
        </Button>
      </div>
    </div>
  );
}

// ============================
// New Category Dialog
// ============================
function NewCategoryDialog({
  open,
  onOpenChange,
  onCreated,
  forceInstitutional = false,
  lockedDomain = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
  forceInstitutional?: boolean;
  lockedDomain?: DomainKey | null;
}) {
  const [domain, setDomain] = useState<DomainKey>(lockedDomain ?? "physical");
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [description, setDescription] = useState("");
  const [skipHandover, setSkipHandover] = useState(false);
  const [skipReturn, setSkipReturn] = useState(false);
  const [subs, setSubs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const createMutation = useCreateCategory();
  const createGroupMutation = useCreateAssetGroup();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDomain(lockedDomain ?? "physical");
      setPrefix("");
      setName("");
      setDescription("");
      setSkipHandover(false);
      setSkipReturn(false);
      setSubs([]);
      setNewSub("");
    }
  }, [open, lockedDomain]);

  const defaults = DOMAIN_DEFAULTS[domain];

  const addSub = () => {
    const trimmed = newSub.trim();
    if (!trimmed) return;
    if (subs.some((s) => s === trimmed)) {
      setNewSub("");
      return;
    }
    setSubs([...subs, trimmed]);
    setNewSub("");
  };

  const handleCreate = async () => {
    if (!name.trim() || !prefix.trim()) {
      toast({ title: "שגיאה", description: "שם קטגוריה וקידומת הם שדות חובה", variant: "destructive" });
      return;
    }
    try {
      const cat = await createMutation.mutateAsync({
        category_name: name,
        prefix: prefix.toUpperCase(),
        description: description || undefined,
        domain,
        protocol_type: defaults.protocol_type,
        is_assignable: forceInstitutional ? false : defaults.is_assignable,
        skip_handover_form: skipHandover,
        skip_return_form: skipReturn,
      });
      const pending = [...subs, newSub.trim()].filter(Boolean);
      for (const subName of pending) {
        await createGroupMutation.mutateAsync({
          category_id: cat.id,
          name: subName,
          default_owner_role: (cat as any).default_owner_role ?? null,
          company_id: (cat as any).company_id ?? null,
        });
      }
      toast({
        title: "הקטגוריה נוצרה בהצלחה",
        description: pending.length ? `נוצרו ${pending.length} תתי-קטגוריות` : undefined,
      });
      onCreated(cat.id);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };


  const lockedMeta = lockedDomain ? DOMAIN_META[lockedDomain] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>קטגוריה חדשה</DialogTitle>
          <DialogDescription>
            {lockedMeta
              ? `נוסיף קטגוריה תחת הדומיין "${lockedMeta.title}"`
              : "בחר דומיין והגדר קטגוריה חדשה עם קידומת ייחודית לברקוד"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {!lockedDomain && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">דומיין</label>
              <select
                value={domain}
                onChange={(e) => {
                  const d = e.target.value as DomainKey;
                  setDomain(d);
                  if (!prefix) setPrefix(DOMAIN_DEFAULTS[d].suggested_prefix);
                }}
                className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {DOMAIN_ORDER.map((k) => (
                  <option key={k} value={k}>{DOMAIN_META[k].title}</option>
                ))}
              </select>
            </div>
          )}
          {lockedMeta && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
              <div className={cn("w-7 h-7 rounded-md flex items-center justify-center", lockedMeta.color.bg, lockedMeta.color.text)}>
                <lockedMeta.icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">{lockedMeta.title}</span>
              <span className="text-[11px] text-muted-foreground mr-auto">{lockedMeta.hint}</span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">שם הקטגוריה</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="למשל: טאבלטים"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">קידומת (3 אותיות באנגלית)</label>
            <input
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 4))}
              placeholder={defaults.suggested_prefix}
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono uppercase"
              dir="ltr"
              maxLength={4}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">תיאור (אופציונלי)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר של הקטגוריה"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">תתי-קטגוריות (אופציונלי)</label>
            <div className="flex gap-2">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }}
                placeholder="למשל: מסך / ראוטר"
                className="flex-1 px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="button" size="sm" variant="outline" onClick={addSub} disabled={!newSub.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {subs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {subs.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs">
                    {s}
                    <button type="button" onClick={() => setSubs(subs.filter((x) => x !== s))} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">יווצרו יחד עם הקטגוריה.</p>
          </div>



          {(forceInstitutional ? false : defaults.is_assignable) && (
            <div className="space-y-2 pt-2 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground">הגדרות טופסי מסירה/החזרה</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipHandover}
                  onChange={(e) => setSkipHandover(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
                />
                <div className="text-sm">
                  <div>דלג על אישור משיכה</div>
                  <div className="text-[11px] text-muted-foreground">פריטים בקטגוריה זו ישויכו לעובד ישירות, ללא טופס מסירה וחתימה.</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipReturn}
                  onChange={(e) => setSkipReturn(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
                />
                <div className="text-sm">
                  <div>דלג על אישור זיכוי</div>
                  <div className="text-[11px] text-muted-foreground">החזרת פריטים בקטגוריה זו למלאי תתבצע ללא טופס החזרה וחתימה.</div>
                </div>
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCreate} disabled={createMutation.isPending}>
              <Check className="w-4 h-4" />
              {createMutation.isPending ? "יוצר..." : "צור קטגוריה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
