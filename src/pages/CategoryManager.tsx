import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus, GripVertical, Trash2, Save, Pencil,
  Type, Hash, Calendar, List, ListChecks, Settings2, Check, X, ChevronDown,
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

type FieldType = "text" | "number" | "date" | "list" | "list_multi";

interface LocalField {
  id?: string;
  tempId: string;
  field_name: string;
  field_type: FieldType;
  is_required: boolean;
  field_options: string[] | null;
  sort_order: number;
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatDomain, setNewCatDomain] = useState<DomainKey | null>(null);
  const [openDomains, setOpenDomains] = useState<Set<DomainKey>>(new Set(DOMAIN_ORDER));
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; assetCount: number } | null>(null);
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

  const toggleDomain = (k: DomainKey) => {
    setOpenDomains((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

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
      toast({ title: "תת-הקטגוריה נמחקה" });
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">ניהול דומיינים ותת-קטגוריות</h1>
          <p className="page-subtitle">
            6 דומיינים קשיחים · תת-קטגוריות נוצרות מתוך הדומיין שלהן עם שדות מותאמים
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => openNewInDomain(null)}>
          <Plus className="w-4 h-4" />
          תת-קטגוריה חדשה
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Domains accordion */}
          <div className="space-y-3 lg:order-last">
            {DOMAIN_ORDER.map((key) => {
              const meta = DOMAIN_META[key];
              const Icon = meta.icon;
              const cats = byDomain[key] ?? [];
              const isOpen = openDomains.has(key);
              const totalAssets = cats.reduce((s, c: any) => s + (c.assets?.[0]?.count ?? 0), 0);
              return (
                <div key={key} className="bg-card rounded-xl border border-border/60 overflow-hidden">
                  <button
                    onClick={() => toggleDomain(key)}
                    className="w-full text-right p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
                  >
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", meta.color.bg, meta.color.text)}>
                      <Icon className="w-5 h-5" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="font-medium text-sm">{meta.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {cats.length} תת-קטגוריות · {totalAssets} פריטים
                      </p>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border/50 p-2 space-y-1">
                      {cats.length === 0 && (
                        <p className="text-[11px] text-muted-foreground px-2 py-3 text-center">
                          אין עדיין תת-קטגוריות בדומיין זה
                        </p>
                      )}
                      {cats.map((cat: any) => {
                        const assetCount = cat.assets?.[0]?.count ?? 0;
                        const active = selectedId === cat.id;
                        return (
                          <div
                            key={cat.id}
                            onClick={() => setSelectedId(cat.id)}
                            className={cn(
                              "w-full text-right rounded-lg px-3 py-2 transition-all cursor-pointer group flex items-center gap-2",
                              active ? "ring-2 ring-primary bg-primary/5" : "hover:bg-muted/50"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">{cat.category_name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                <span className="font-mono">{cat.prefix}</span> · {assetCount} פריטים
                              </p>
                            </div>
                            <button
                              onClick={(e) => handleDeleteClick(e, cat)}
                              title="מחק תת-קטגוריה"
                              className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        onClick={() => openNewInDomain(key)}
                        className={cn(
                          "w-full text-right rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5 border border-dashed border-border/60 hover:border-primary/40 transition-colors flex items-center gap-2 justify-center"
                        )}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        תת-קטגוריה חדשה ב{meta.title}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Fields editor */}
          <div className="lg:col-span-2 lg:order-first">
            {selectedId ? (
              <div className="space-y-4">
                <CategoryEditor category={categories?.find((c) => c.id === selectedId)!} />
                <FieldsEditor
                  categoryId={selectedId}
                  categoryName={categories?.find((c) => c.id === selectedId)?.category_name ?? ""}
                />
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
                <Settings2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium">בחר תת-קטגוריה לעריכת שדות</p>
                <p className="text-sm mt-1">או צור תת-קטגוריה חדשה מתוך אחד הדומיינים</p>
              </div>
            )}
          </div>
        </div>
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
            <AlertDialogTitle>מחיקת תת-קטגוריה</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && deleteTarget.assetCount > 0 ? (
                <>
                  תת-הקטגוריה <strong>{deleteTarget.name}</strong> מכילה {deleteTarget.assetCount} פריטים.
                  <br />
                  יש להעביר או למחוק את הפריטים תחילה.
                </>
              ) : (
                <>האם למחוק את תת-הקטגוריה <strong>{deleteTarget?.name}</strong>? פעולה זו תמחק גם את השדות המותאמים שלה ואינה הפיכה.</>
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

// ============================
// Fields Editor with Drag & Drop
// ============================
function FieldsEditor({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const { data: dbFields, isLoading } = useCategoryFields(categoryId);
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
function CategoryEditor({ category }: { category: { id: string; category_name: string; prefix: string; description?: string | null; skip_handover_form?: boolean | null; skip_return_form?: boolean | null; default_notification_days_before?: number | null; is_assignable?: boolean | null } }) {
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

  useEffect(() => {
    setName(category.category_name);
    setPrefix(category.prefix);
    setDescription(category.description ?? "");
    setIsAssignable(category.is_assignable !== false);
    setSkipHandover(!!category.skip_handover_form);
    setSkipReturn(!!category.skip_return_form);
    setNotifDays(category.default_notification_days_before == null ? "" : String(category.default_notification_days_before));
    setEditing(false);
  }, [category.id, category.category_name, category.prefix, category.description, category.is_assignable, category.skip_handover_form, category.skip_return_form, category.default_notification_days_before]);

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
      });
      toast({ title: "קטגוריה עודכנה בהצלחה" });
      setEditing(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  if (!editing) {
    return (
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
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5" />
          ערוך
        </Button>
      </div>
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
  const createMutation = useCreateCategory();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setDomain(lockedDomain ?? "physical");
      setPrefix("");
      setName("");
      setDescription("");
      setSkipHandover(false);
      setSkipReturn(false);
    }
  }, [open, lockedDomain]);

  const defaults = DOMAIN_DEFAULTS[domain];

  const handleCreate = async () => {
    if (!name.trim() || !prefix.trim()) {
      toast({ title: "שגיאה", description: "שם תת-קטגוריה וקידומת הם שדות חובה", variant: "destructive" });
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
      toast({ title: "תת-הקטגוריה נוצרה בהצלחה" });
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
          <DialogTitle>תת-קטגוריה חדשה</DialogTitle>
          <DialogDescription>
            {lockedMeta
              ? `נוסיף תת-קטגוריה תחת הדומיין "${lockedMeta.title}"`
              : "בחר דומיין והגדר תת-קטגוריה חדשה עם קידומת ייחודית לברקוד"}
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
            <label className="text-sm font-medium mb-1.5 block">שם תת-הקטגוריה</label>
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
              placeholder="תיאור קצר של תת-הקטגוריה"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
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
                  <div className="text-[11px] text-muted-foreground">פריטים בתת-קטגוריה זו ישויכו לעובד ישירות, ללא טופס מסירה וחתימה.</div>
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
                  <div className="text-[11px] text-muted-foreground">החזרת פריטים בתת-קטגוריה זו למלאי תתבצע ללא טופס החזרה וחתימה.</div>
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
              {createMutation.isPending ? "יוצר..." : "צור תת-קטגוריה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
