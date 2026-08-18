import { useMemo, useState } from "react";
import { Plus, Check, X } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAssetGroups, useCreateAssetGroup } from "@/hooks/useAssetGroups";
import { useToast } from "@/hooks/use-toast";

interface Props {
  categoryId: string;
  /** company_id of the category — needed when no active company is selected */
  companyId?: string | null;
  /** default owner role inherited from the category */
  defaultOwnerRole?: string | null;
  value: string;
  onChange: (groupId: string) => void;
  error?: boolean;
  disabled?: boolean;
}

/**
 * Sub-category (תת-קטגוריה) picker with inline creation of a new value,
 * shared by the asset dialogs and the onboarding flow.
 */
export function SubCategorySelect({
  categoryId,
  companyId,
  defaultOwnerRole,
  value,
  onChange,
  error,
  disabled,
}: Props) {
  const { data: assetGroups } = useAssetGroups();
  const createGroup = useCreateAssetGroup();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const groups = useMemo(
    () => (assetGroups ?? []).filter((g) => g.category_id === categoryId),
    [assetGroups, categoryId]
  );

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const g = await createGroup.mutateAsync({
        category_id: categoryId,
        name,
        default_owner_role: defaultOwnerRole ?? null,
        company_id: companyId ?? null,
      });
      onChange(g.id);
      setNewName("");
      setAdding(false);
      toast({ title: "תת-הקטגוריה נוצרה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  if (adding) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleCreate(); }
            if (e.key === "Escape") { setAdding(false); setNewName(""); }
          }}
          placeholder="שם תת-קטגוריה חדשה"
          dir="rtl"
          className="text-right h-9"
        />
        <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createGroup.isPending}>
          <Check className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); }}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={groups.map((g) => ({ value: g.id, label: g.name }))}
        placeholder={groups.length ? "בחר תת-קטגוריה..." : "אין עדיין תתי-קטגוריות"}
        error={error}
      />
      {!disabled && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          תת-קטגוריה חדשה
        </button>
      )}
    </div>
  );
}
