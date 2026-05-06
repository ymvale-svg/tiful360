import { useMemo, useState } from "react";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { getCategoryIcon } from "@/lib/categoryIcons";
import { Search, Plus, Building2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};
const assetStatusClasses: Record<string, string> = {
  in_use: "status-active", in_stock: "status-onboarding", in_repair: "status-leaving", lost: "status-inactive",
};

interface Props {
  categoryId: string;
  onBack: () => void;
  onSelectAsset: (assetId: string) => void;
  onAddAsset: (categoryId: string) => void;
}

export function CategoryAssetsList({ categoryId, onBack, onSelectAsset, onAddAsset }: Props) {
  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const category = (categories ?? []).find((c: any) => c.id === categoryId) as any;
  const Icon = getCategoryIcon(category?.category_name);
  const isAssignable = category?.is_assignable !== false;

  const items = useMemo(() => {
    return (assets ?? []).filter((a: any) => {
      if (a.category_id !== categoryId) return false;
      if (status !== "all" && a.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          a.asset_name?.toLowerCase().includes(q) ||
          a.asset_code?.toLowerCase().includes(q) ||
          a.serial_number?.toLowerCase().includes(q) ||
          a.employees?.full_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assets, categoryId, search, status]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" />
          נכסים
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{category?.category_name ?? "—"}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{category?.category_name}</h1>
            <p className="text-xs text-muted-foreground">
              {items.length} פריטים {!isAssignable && "· נכס מוסדי"}
            </p>
          </div>
        </div>
        <Button onClick={() => onAddAsset(categoryId)} className="gap-2">
          <Plus className="w-4 h-4" />
          פריט חדש
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-80">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש בקטגוריה..."
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
        {isAssignable && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="in_use">בשימוש</option>
            <option value="in_stock">במלאי</option>
            <option value="in_repair">בתיקון</option>
            <option value="lost">אבד</option>
          </select>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          לא נמצאו פריטים בקטגוריה זו
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
          {items.map((a: any) => {
            const expiry = a.expiry_date ? new Date(a.expiry_date) : null;
            const expired = expiry && expiry < new Date();
            return (
              <button
                key={a.id}
                onClick={() => onSelectAsset(a.id)}
                className="w-full text-right px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-4"
              >
                <div className="font-mono text-xs text-muted-foreground w-24 shrink-0">{a.asset_code}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {!isAssignable && <Building2 className="w-3.5 h-3.5 text-primary/70 shrink-0" />}
                    <span className="truncate">{a.asset_name}</span>
                  </div>
                  {a.serial_number && (
                    <div className="text-xs text-muted-foreground truncate">סידורי: {a.serial_number}</div>
                  )}
                </div>
                <div className="text-sm text-muted-foreground hidden md:block min-w-[140px]">
                  {isAssignable ? (a.employees?.full_name ?? "במלאי") : "נכס חברה"}
                </div>
                {isAssignable && (
                  <span className={cn("status-badge", assetStatusClasses[a.status])}>
                    {assetStatusLabels[a.status] ?? a.status}
                  </span>
                )}
                {expiry && (
                  <span className={cn("text-xs", expired ? "text-destructive" : "text-muted-foreground")}>
                    {expiry.toLocaleDateString("he-IL")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
