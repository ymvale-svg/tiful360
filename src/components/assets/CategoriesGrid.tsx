import { useMemo } from "react";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";

interface Props {
  onSelectCategory: (categoryId: string) => void;
}

export function CategoriesGrid({ onSelectCategory }: Props) {
  const { data: categories, isLoading } = useAssetCategories();
  const { data: assets } = useAssets();

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; expiringSoon: number; expired: number }>();
    const today = new Date();
    const in30 = new Date();
    in30.setDate(today.getDate() + 30);
    for (const a of assets ?? []) {
      const key = (a as any).category_id;
      if (!key) continue;
      const cur = map.get(key) ?? { count: 0, expiringSoon: 0, expired: 0 };
      cur.count++;
      const exp = (a as any).expiry_date ? new Date((a as any).expiry_date) : null;
      if (exp) {
        if (exp < today) cur.expired++;
        else if (exp <= in30) cur.expiringSoon++;
      }
      map.set(key, cur);
    }
    return map;
  }, [assets]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">טוען...</div>;
  }

  const assignable = (categories ?? []).filter((c: any) => c.is_assignable !== false);
  const institutional = (categories ?? []).filter((c: any) => c.is_assignable === false);

  const renderGroup = (title: string, items: any[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 gap-4">
          {items.map((cat: any) => {
            const Icon = getCategoryIcon(cat.category_name);
            const color = getCategoryColor(cat.category_name);
            const s = stats.get(cat.id) ?? { count: 0, expiringSoon: 0, expired: 0 };
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className={cn(
                  "group relative bg-card border border-border rounded-2xl p-5 text-right",
                  "hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 transition-all",
                  color.ring,
                  "flex flex-col items-center gap-3 aspect-square justify-center"
                )}
              >
                {(s.expired > 0 || s.expiringSoon > 0) && (
                  <span
                    className={cn(
                      "absolute top-2 left-2 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                      s.expired > 0
                        ? "bg-destructive/15 text-destructive"
                        : "bg-warning/15 text-warning"
                    )}
                    title={s.expired > 0 ? `${s.expired} פגי תוקף` : `${s.expiringSoon} קרובים לפוג`}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {s.expired > 0 ? s.expired : s.expiringSoon}
                  </span>
                )}
                <div className={cn(
                  "w-20 h-20 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105",
                  color.bg, color.text
                )}>
                  <Icon className="w-10 h-10" strokeWidth={1.75} />
                </div>
                <div className="text-base font-semibold text-center line-clamp-2">{cat.category_name}</div>
                <div className="text-xs text-muted-foreground">{s.count} פריטים</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  if ((categories ?? []).length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
        אין קטגוריות עדיין. עברו ללשונית "קטגוריות" כדי להוסיף.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {renderGroup("נכסים מוקצים לעובדים", assignable)}
      {renderGroup("נכסים מוסדיים", institutional)}
    </div>
  );
}
