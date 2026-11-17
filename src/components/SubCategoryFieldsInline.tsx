import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssetGroups, useUpdateAssetGroup } from "@/hooks/useAssetGroups";
import { useToast } from "@/hooks/use-toast";
import { getBuiltinFields, isBuiltinFieldVisible } from "@/lib/builtinFields";
import { useCategoryFields } from "@/hooks/useCategories";
import type { DomainKey } from "@/lib/assetDomains";

/** Checklist of built-in fields for one sub-category. Saves on click. */
export function SubCategoryFieldsChecklist({ group, domain }: { group: any; domain: DomainKey | null }) {
  const updateGroup = useUpdateAssetGroup();
  const { toast } = useToast();
  const fields = useMemo(() => getBuiltinFields(domain), [domain]);
  const { data: categoryFieldsRaw } = useCategoryFields(group.category_id);
  // Fields defined for the whole category (not for one sub-category); each can be hidden here.
  const categoryFields = useMemo(
    () => (categoryFieldsRaw ?? []).filter((f: any) => !f.group_id),
    [categoryFieldsRaw],
  );
  const hidden: string[] = Array.isArray(group.hidden_category_fields) ? group.hidden_category_fields.map(String) : [];

  const toggle = async (key: string) => {
    const current = Array.isArray(group.visible_builtin_fields)
      ? group.visible_builtin_fields.map(String)
      : fields.filter((f) => f.defaultVisible).map((f) => f.key);
    const next = current.includes(key) ? current.filter((k: string) => k !== key) : [...current, key];
    try {
      await updateGroup.mutateAsync({ id: group.id, visible_builtin_fields: next });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const toggleCategoryField = async (fieldId: string) => {
    const next = hidden.includes(fieldId) ? hidden.filter((id) => id !== fieldId) : [...hidden, fieldId];
    try {
      await updateGroup.mutateAsync({ id: group.id, hidden_category_fields: next });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">שדה שלא מסומן לא יופיע בכרטיס הפריט ולא בטופס ההוספה. נשמר מיד.</p>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">אין שדות קבועים בתחום זה.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {fields.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={isBuiltinFieldVisible(group, f.key, domain)} onChange={() => toggle(f.key)} />
              <span className="truncate">{f.label}</span>
            </label>
          ))}
        </div>
      )}
      {categoryFields.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">שדות שהוגדרו לכל הקטגוריה</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {categoryFields.map((f: any) => (
              <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary"
                  checked={!hidden.includes(f.id)}
                  onChange={() => toggleCategoryField(f.id)}
                  disabled={updateGroup.isPending}
                />
                <span className="truncate">{f.field_name}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">הסתרה לא מוחקת ערכים שכבר נשמרו בפריטים.</p>
        </fieldset>
      )}
    </div>
  );
}

/** Inline accordion of a category's sub-categories with their field checklists. */
export function SubCategoryFieldsInline({ categoryId, domain }: { categoryId: string; domain: DomainKey | null }) {
  const { data: groups } = useAssetGroups();
  const [openId, setOpenId] = useState<string | null>(null);
  const list = (groups ?? []).filter((g: any) => g.category_id === categoryId);
  if (list.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-4 space-y-2">
      <div className="text-sm font-medium">שדות לפי תת-קטגוריה</div>
      <p className="text-xs text-muted-foreground">לחצו על תת-קטגוריה כדי לבחור אילו שדות יופיעו בה.</p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {list.map((g: any) => {
          const open = openId === g.id;
          return (
            <div key={g.id}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : g.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 text-start"
              >
                <span>{g.name}</span>
                <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="px-3 pb-3">
                  <SubCategoryFieldsChecklist group={g} domain={domain} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
