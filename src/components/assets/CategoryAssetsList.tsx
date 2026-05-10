import { useMemo, useState } from "react";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { Search, Plus, Building2, ChevronLeft, AlertTriangle, Users } from "lucide-react";
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
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const category = (categories ?? []).find((c: any) => c.id === categoryId) as any;
  const Icon = getCategoryIcon(category?.category_name);
  const color = getCategoryColor(category?.category_name);
  const isAssignable = category?.is_assignable !== false;
  const isInsurance = category?.prefix === "CINS";

  // Determine the grouping key per asset:
  // - Insurance categories: group by custom_fields["סוג ביטוח"] (sub-category)
  // - Other categories: group by asset_name
  const groupKeyOf = (a: any): string => {
    if (isInsurance) {
      const t = (a.custom_fields?.["סוג ביטוח"] ?? "").toString().trim();
      return t || "ללא סוג ביטוח";
    }
    return (a.asset_name ?? "ללא שם").trim();
  };

  // All assets in this category
  const categoryAssets = useMemo(
    () => (assets ?? []).filter((a: any) => a.category_id === categoryId),
    [assets, categoryId]
  );

  // Group into sub-categories
  const subCategories = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const a of categoryAssets) {
      const key = groupKeyOf(a);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    let arr = Array.from(map.entries()).map(([name, list]) => {
      const assigned = list.filter((x) => x.status === "in_use").length;
      return { name, items: list, total: list.length, assigned };
    });
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((s) => s.name.toLowerCase().includes(q));
    }
    return arr.sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [categoryAssets, search, isInsurance]);

  // Items inside the selected sub-category
  const subItems = useMemo(() => {
    if (!selectedSub) return [];
    let list = categoryAssets.filter((a: any) => groupKeyOf(a) === selectedSub);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((a: any) => {
        if (isInsurance) {
          return (
            a.asset_name?.toLowerCase().includes(q) ||
            a.asset_code?.toLowerCase().includes(q) ||
            a.custom_fields?.["מספר פוליסה"]?.toString().toLowerCase().includes(q) ||
            a.custom_fields?.["חברת ביטוח"]?.toString().toLowerCase().includes(q) ||
            a.custom_fields?.["שם סוכן ביטוח"]?.toString().toLowerCase().includes(q)
          );
        }
        return (
          a.asset_code?.toLowerCase().includes(q) ||
          a.serial_number?.toLowerCase().includes(q) ||
          a.employees?.full_name?.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [categoryAssets, selectedSub, search, isInsurance]);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" />
          נכסים
        </button>
        <span className="text-muted-foreground">/</span>
        {selectedSub ? (
          <>
            <button
              onClick={() => setSelectedSub(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {category?.category_name ?? "—"}
            </button>
            <span className="text-muted-foreground">/</span>
            <span className="font-medium">{selectedSub}</span>
          </>
        ) : (
          <span className="font-medium">{category?.category_name ?? "—"}</span>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            key={selectedSub ?? "root"}
            className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center shadow-md ring-1 ring-border/50 animate-in fade-in zoom-in-95 duration-300",
              color.bg, color.text
            )}
          >
            {selectedSub
              ? (isAssignable ? <Icon className="w-9 h-9" strokeWidth={1.75} /> : <Building2 className="w-9 h-9" strokeWidth={1.75} />)
              : <Icon className="w-9 h-9" strokeWidth={1.75} />}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {selectedSub ?? category?.category_name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {selectedSub
                ? (isInsurance ? `${subItems.length} פוליסות` : `${subItems.length} שיוכים`)
                : (isInsurance
                    ? `${subCategories.length} סוגי ביטוח · ${categoryAssets.length} פוליסות`
                    : `${subCategories.length} תתי־קטגוריה · ${categoryAssets.length} פריטים`)}
              {!isAssignable && !isInsurance && " · נכס מוסדי"}
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
            placeholder={
              selectedSub
                ? (isInsurance ? "חיפוש בפוליסות..." : "חיפוש בשיוכים...")
                : (isInsurance ? "חיפוש בסוגי ביטוח..." : "חיפוש בתתי־קטגוריה...")
            }
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : !selectedSub ? (
        // ---------- Sub-category icons grid ----------
        subCategories.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            לא נמצאו פריטים בקטגוריה זו
          </div>
        ) : (
          <div key="subs" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {subCategories.map((sc, idx) => (
              <button
                key={sc.name}
                onClick={() => setSelectedSub(sc.name)}
                style={{ animationDelay: `${Math.min(idx * 30, 300)}ms`, animationFillMode: "both" }}
                className={cn(
                  "group relative bg-card border border-border rounded-2xl p-5 text-center",
                  "hover:shadow-xl hover:-translate-y-1 hover:ring-2 active:scale-[0.98] transition-all duration-200",
                  color.ring,
                  "flex flex-col items-center gap-3 aspect-square justify-center",
                  "animate-in fade-in zoom-in-95"
                )}
              >
                <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {sc.total}
                </span>
                <div className={cn(
                  "w-24 h-24 rounded-2xl flex items-center justify-center shadow-md ring-1 ring-border/40",
                  "transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:ring-2",
                  color.bg, color.text, color.ring
                )}>
                  {!isAssignable
                    ? <Building2 className="w-12 h-12" strokeWidth={1.75} />
                    : <Icon className="w-12 h-12" strokeWidth={1.75} />
                  }
                </div>
                <div className="w-full">
                  <div className="text-base font-semibold line-clamp-2 leading-tight">{sc.name}</div>
                  {isInsurance ? (
                    <div className="text-xs text-muted-foreground mt-1">
                      {sc.total} פוליסות
                    </div>
                  ) : isAssignable && (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center justify-center gap-1">
                      <Users className="w-3 h-3" />
                      {sc.assigned} משויכים / {sc.total}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        // ---------- Assignments list (instances of the chosen sub-category) ----------
        subItems.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
            {isInsurance ? "לא נמצאו פוליסות" : "לא נמצאו שיוכים"}
          </div>
        ) : (
          <div key="items" className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                {isInsurance ? (
                  <tr>
                    <th className="text-right px-4 py-2 font-medium">מזהה</th>
                    <th className="text-right px-4 py-2 font-medium">שם פוליסה</th>
                    <th className="text-right px-4 py-2 font-medium">מספר פוליסה</th>
                    <th className="text-right px-4 py-2 font-medium">חברת ביטוח</th>
                    <th className="text-right px-4 py-2 font-medium">תוקף עד</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="text-right px-4 py-2 font-medium">מזהה</th>
                    <th className="text-right px-4 py-2 font-medium">מס׳ סידורי</th>
                    <th className="text-right px-4 py-2 font-medium">משויך ל</th>
                    <th className="text-right px-4 py-2 font-medium">סטטוס</th>
                    <th className="text-right px-4 py-2 font-medium">תפוגה</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {subItems.map((a: any) => {
                  const expiry = a.expiry_date ? new Date(a.expiry_date) : null;
                  const expired = expiry && expiry < new Date();
                  if (isInsurance) {
                    return (
                      <tr
                        key={a.id}
                        onClick={() => onSelectAsset(a.id)}
                        className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      >
                        <td className="px-4 py-2 font-mono text-xs">{a.asset_code}</td>
                        <td className="px-4 py-2">{a.asset_name}</td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {a.custom_fields?.["מספר פוליסה"] ?? "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {a.custom_fields?.["חברת ביטוח"] ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2 text-xs">
                          {expiry ? (
                            <span className={cn("flex items-center gap-1", expired && "text-destructive")}>
                              {expired && <AlertTriangle className="w-3 h-3" />}
                              {expiry.toLocaleDateString("he-IL")}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr
                      key={a.id}
                      onClick={() => onSelectAsset(a.id)}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    >
                      <td className="px-4 py-2 font-mono text-xs">{a.asset_code}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{a.serial_number ?? "—"}</td>
                      <td className="px-4 py-2">{a.employees?.full_name ?? <span className="text-muted-foreground">במלאי</span>}</td>
                      <td className="px-4 py-2">
                        {isAssignable && (
                          <span className={cn("status-badge text-[10px] px-1.5 py-0.5", assetStatusClasses[a.status])}>
                            {assetStatusLabels[a.status] ?? a.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {expiry ? (
                          <span className={cn("flex items-center gap-1", expired && "text-destructive")}>
                            {expired && <AlertTriangle className="w-3 h-3" />}
                            {expiry.toLocaleDateString("he-IL")}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
