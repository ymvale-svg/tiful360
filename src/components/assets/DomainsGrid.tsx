import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAssets, useAssetCategories, useITTickets } from "@/hooks/useData";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { cn } from "@/lib/utils";
import {
  DOMAIN_META,
  DOMAIN_ORDER,
  domainKeyToSlug,
  getDomain,
  type DomainKey,
} from "@/lib/assetDomains";
import {
  AlertTriangle,
  Users,
  Clock,
  ArrowLeftRight,
} from "lucide-react";

interface Props {
  /** Deprecated — domain cards now navigate via /assets/:domain. Kept optional for back-compat. */
  onSelectCategory?: (categoryId: string) => void;
  onQuickAssign?: () => void;
}

function domainSubtitle(key: DomainKey, cats: any[], assets: any[]): string {
  switch (key) {
    case "licenses": {
      const sw = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "SFT").length;
      const sub = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "MAN").length;
      return `${assets.length} פריטים · ${sw} תוכנות · ${sub} מנויים`;
    }
    case "digital":
      return `${assets.length} גישות פעילות`;
    case "physical": {
      const inUse = assets.filter((a) => a.status === "in_use").length;
      const inStock = assets.filter((a) => a.status === "in_stock").length;
      return `${assets.length} פריטים · ${inUse} בשימוש · ${inStock} במלאי`;
    }
    case "real_estate": {
      const tenant = assets.filter((a) => (a.custom_fields as any)?.["כיוון חוזה"] === "החברה שוכרת").length;
      const landlord = assets.filter((a) => (a.custom_fields as any)?.["כיוון חוזה"] === "החברה משכירה").length;
      return `${assets.length} נכסים · ${tenant} שוכרים · ${landlord} משכירים`;
    }
    case "training":
      return `${assets.length} פריטי הדרכה/תאימות`;
    case "insurance": {
      const insCount = assets.filter((a) => {
        const c = cats.find((cc) => cc.id === a.category_id);
        return c?.prefix === "CINS" || c?.protocol_type === "insurance";
      }).length;
      const certCount = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "CERT").length;
      return `${insCount} ביטוחים · ${certCount} אישורים`;
    }
  }
}

export function DomainsGrid({ onQuickAssign }: Props) {
  const navigate = useNavigate();
  const { data: categories, isLoading } = useAssetCategories();
  const { data: assets } = useAssets();
  const { data: expiring } = useExpiringAssets(30);
  const { data: tickets } = useITTickets();

  const grouped = useMemo(() => {
    const cats = categories ?? [];
    const all = assets ?? [];
    const catsByDomain = new Map<DomainKey, any[]>();
    for (const k of DOMAIN_ORDER) catsByDomain.set(k, []);
    for (const c of cats) catsByDomain.get(getDomain(c))!.push(c);

    return DOMAIN_ORDER.map((key) => {
      const meta = DOMAIN_META[key];
      const domainCats = catsByDomain.get(key) ?? [];
      const catIds = new Set(domainCats.map((c) => c.id));
      const domainAssets = all.filter((a: any) => catIds.has(a.category_id));
      const sortedCats = [...domainCats]
        .map((c) => ({ ...c, _count: domainAssets.filter((a: any) => a.category_id === c.id).length }))
        .sort((a, b) => b._count - a._count);
      const domainExpiring = (expiring ?? []).filter((e) => catIds.has(e.category_id));
      const expired = domainExpiring.filter((e) => e.days_left <= 0).length;
      const soon = domainExpiring.filter((e) => e.days_left > 0 && e.days_left <= 14).length;
      return { meta, cats: sortedCats, assets: domainAssets, expired, soon };
    });
  }, [categories, assets, expiring]);

  const totalExpired = (expiring ?? []).filter((e) => e.days_left <= 0).length;
  const totalSoon30 = (expiring ?? []).filter((e) => e.days_left > 0).length;
  const openOffboardings = (tickets ?? []).filter((t: any) => t.ticket_type === "offboarding" && t.status !== "done").length;

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">טוען...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Status chips */}
      <div className="flex flex-wrap items-center gap-2">
        {openOffboardings > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-info/10 text-info border border-info/20 text-xs font-medium">
            <Users className="w-3.5 h-3.5" />
            {openOffboardings} תהליכי offboarding פתוחים
          </span>
        )}
        {totalSoon30 > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20 text-xs font-medium">
            <Clock className="w-3.5 h-3.5" />
            {totalSoon30} פגים תוך 30 יום
          </span>
        )}
        {totalExpired > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {totalExpired} פריטים פגי תוקף
          </span>
        )}
      </div>

      {/* Domain cards */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 text-right">6 דומיינים</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map(({ meta, cats, assets, expired, soon }) => {
            const Icon = meta.icon;
            const badge = expired > 0
              ? { text: `${expired} פגי תוקף`, cls: "bg-destructive/10 text-destructive" }
              : soon > 0
              ? { text: `חידוש תוך 14 יום`, cls: "bg-warning/10 text-warning" }
              : null;

            const slug = domainKeyToSlug(meta.key);
            const openDomain = () => navigate(`/assets/${slug}`);
            const isEmpty = cats.length === 0;
            return (
              <div
                key={meta.key}
                role="button"
                tabIndex={0}
                onClick={openDomain}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openDomain();
                  }
                }}
                className={cn(
                  "group relative bg-card border border-border rounded-2xl p-5 transition-all text-right cursor-pointer hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 focus:outline-none focus:ring-2",
                  isEmpty && "opacity-70",
                  meta.color.ring
                )}
              >
                {badge && (
                  <span className={cn(
                    "absolute top-3 left-3 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
                    badge.cls
                  )}>
                    <AlertTriangle className="w-3 h-3" />
                    {badge.text}
                  </span>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 text-right pr-2">
                    <h3 className="text-base font-semibold leading-tight">{meta.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEmpty ? "אין פריטים בדומיין זה" : domainSubtitle(meta.key, cats, assets)}
                    </p>
                  </div>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    meta.color.bg, meta.color.text
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                </div>

                {/* Sub-category chips */}
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {isEmpty ? (
                    <a
                      href="/assets?tab=categories"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] px-2 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    >
                      + הוסף תת-קטגוריה ראשונה
                    </a>
                  ) : (
                    <>
                      {cats.slice(0, 6).map((c) => (
                        <button
                          key={c.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/assets/${slug}?sub=${c.id}`);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors",
                            meta.color.text
                          )}
                        >
                          <span>{c.category_name}</span>
                          <span className="text-muted-foreground">{c._count ?? 0}</span>
                        </button>
                      ))}
                      {cats.length > 6 && (
                        <span className="inline-flex items-center text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground">
                          +{cats.length - 6}
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick-assign CTA */}
      {onQuickAssign && (
        <div className="bg-gradient-to-l from-primary/5 to-transparent border border-primary/20 rounded-2xl p-4 flex items-center justify-between gap-4">
          <button
            onClick={onQuickAssign}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium shrink-0"
          >
            <ArrowLeftRight className="w-4 h-4" />
            התחל שיוך
          </button>
          <div className="text-right flex-1">
            <div className="text-sm font-semibold">שיוך מהיר לעובד חדש</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              בחר עובד ⟵ סמן נכסים ⟵ שייך הכל בפעולה אחת — ציוד, גישות, הדרכות
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
