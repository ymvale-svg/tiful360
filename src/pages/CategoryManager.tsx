import { useState, useCallback, useRef, useEffect } from "react";
import {
  Plus, GripVertical, Trash2, Save, ChevronLeft, Pencil,
  Type, Hash, Calendar, List, Package, Settings2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssetCategories } from "@/hooks/useData";
import { useCategoryFields, useCreateCategory, useUpdateCategory, useSaveCategoryFields } from "@/hooks/useCategories";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

type FieldType = "text" | "number" | "date" | "list";

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
};

const fieldTypeLabels: Record<FieldType, string> = {
  text: "טקסט",
  number: "מספר",
  date: "תאריך",
  list: "רשימה",
};

export default function CategoryManager() {
  const { data: categories, isLoading } = useAssetCategories();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">מחולל קטגוריות ציוד</h1>
          <p className="page-subtitle">הגדר סוגי ציוד חדשים עם שדות מותאמים אישית</p>
        </div>
        <Button className="gap-2" onClick={() => setNewCatOpen(true)}>
          <Plus className="w-4 h-4" />
          קטגוריה חדשה
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Category list */}
          <div className="space-y-2">
            {(categories ?? []).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedId(cat.id)}
                className={cn(
                  "w-full text-right bg-card rounded-xl border p-4 transition-all hover:shadow-md",
                  selectedId === cat.id ? "ring-2 ring-primary border-primary" : "border-border/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{cat.category_name}</p>
                    <p className="text-xs text-muted-foreground">
                      קידומת: <span className="font-mono">{cat.prefix}</span>
                      {" • "}
                      {(cat as any).assets?.[0]?.count ?? 0} פריטים
                    </p>
                  </div>
                  <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </button>
            ))}
            {(!categories || categories.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                אין קטגוריות. צור קטגוריה חדשה להתחלה.
              </div>
            )}
          </div>

          {/* Fields editor */}
          <div className="lg:col-span-2">
            {selectedId ? (
              <div className="space-y-4">
                <CategoryEditor category={categories?.find(c => c.id === selectedId)!} />
                <FieldsEditor
                  categoryId={selectedId}
                  categoryName={categories?.find(c => c.id === selectedId)?.category_name ?? ""}
                />
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
                <Settings2 className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium">בחר קטגוריה לעריכת שדות</p>
                <p className="text-sm mt-1">או צור קטגוריה חדשה</p>
              </div>
            )}
          </div>
        </div>
      )}

      <NewCategoryDialog open={newCatOpen} onOpenChange={setNewCatOpen} onCreated={(id) => {
        setSelectedId(id);
        setNewCatOpen(false);
      }} />
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
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-background",
              "hover:border-primary/30 transition-all cursor-move group"
            )}
          >
            {/* Drag handle */}
            <div className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing">
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
                        field_options: type === "list" ? [""] : null,
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
        {fields.filter(f => f.field_type === "list").map((field) => (
          <div key={`opts-${field.tempId}`} className="mr-7 p-3 rounded-lg border border-dashed border-border bg-muted/30 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              אפשרויות רשימה עבור "{field.field_name || "ללא שם"}"
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
// New Category Dialog
// ============================
function NewCategoryDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [description, setDescription] = useState("");
  const createMutation = useCreateCategory();
  const { toast } = useToast();

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
      });
      toast({ title: "קטגוריה נוצרה בהצלחה" });
      onCreated(cat.id);
      setName("");
      setPrefix("");
      setDescription("");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>קטגוריה חדשה</DialogTitle>
          <DialogDescription>הגדר סוג ציוד חדש עם קידומת ייחודית לברקוד</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
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
              onChange={(e) => setPrefix(e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 3))}
              placeholder="TAB"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30 font-mono uppercase"
              dir="ltr"
              maxLength={3}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">תיאור (אופציונלי)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור קצר של סוג הציוד"
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
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
