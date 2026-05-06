import { useMemo, useState } from "react";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { Search, Plus, Building2, ChevronLeft, AlertTriangle } from "lucide-react";
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
  const color = getCategoryColor(category?.category_name);
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center", color.bg, color.text)}>
            <Icon className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-bold">{category?.category_name}</h1>
            <p className="text-xs text-muted-foreground">
              {items.length} פריטים {!isAssignable && "· נכס מוסדי"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onAddAsset(categoryId)} className="gap-2">
            <Plus className="w-4 h-4" />
            פריט חדש
          </Button>
        </div>
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

      {/* Items */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          לא נמצאו פריטים בקטגוריה זו
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4">
          {items.map((a: any) => {
            const expiry = a.expiry_date ? new Date(a.expiry_date) : null;
            const expired = expiry && expiry < new Date();
            const ownerName = a.employees?.full_name;
            return (
              <button
                key={a.id}
                onClick={() => onSelectAsset(a.id)}
                className={cn(
                  "group relative bg-card border border-border rounded-2xl p-5 text-center",
                  "hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 transition-all",
                  color.ring,
                  "flex flex-col items-center gap-3 aspect-square justify-center"
                )}
              >
                {expired && (
                  <span className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive" title="פג תוקף">
                    <AlertTriangle className="w-3 h-3" /> פג
                  </span>
                )}
                {isAssignable && (
                  <span className={cn("absolute top-2 right-2 status-badge text-[10px] px-1.5 py-0.5", assetStatusClasses[a.status])}>
                    {assetStatusLabels[a.status] ?? a.status}
                  </span>
                )}
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105",
                  color.bg, color.text
                )}>
                  {!isAssignable
                    ? <Building2 className="w-10 h-10" strokeWidth={1.75} />
                    : <Icon className="w-10 h-10" strokeWidth={1.75} />
                  }
                </div>
                <div className="w-full">
                  <div className="text-base font-semibold line-clamp-2 leading-tight">{a.asset_name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground mt-1 truncate">{a.asset_code}</div>
                </div>
                <div className="text-xs text-muted-foreground truncate w-full">
                  {isAssignable ? (ownerName ?? "במלאי") : "נכס חברה"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
