import { useMemo } from "react";
import { useAssets, useAssetCategories, useITTickets } from "@/hooks/useData";
import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AppWindow,
  KeySquare,
  Monitor,
  Building,
  GraduationCap,
  ShieldCheck,
  Users,
  Clock,
  ArrowLeftRight,
} from "lucide-react";

interface Props {
  onSelectCategory: (categoryId: string) => void;
  onQuickAssign?: () => void;
}

type DomainKey =
  | "licenses"
  | "digital"
  | "physical"
  | "real_estate"
  | "trainings"
  | "insurance";

interface DomainDef {
  key: DomainKey;
  title: string;
  subtitle: (cats: any[], assets: any[]) => string;
  icon: typeof AppWindow;
  color: { bg: string; text: string; ring: string; soft: string };
}

// Priority order — first match wins, no category appears in two domains.
function classifyCategory(c: any): DomainKey {
  if (c.prefix === "VRT" || c.protocol_type === "digital" || c.prefix === "DACC") return "digital";
  if (c.prefix === "SFT" || c.prefix === "MAN") return "licenses";
  if (c.protocol_type === "real_estate" || c.prefix === "LEASE") return "real_estate";
  if (c.protocol_type === "insurance" || c.prefix === "CERT" || c.prefix === "CINS") return "insurance";
  if (c.protocol_type === "training" || c.prefix === "MAINT") return "trainings";
  return "physical";
}

const DOMAINS: Record<DomainKey, DomainDef> = {
  licenses: {
    key: "licenses",
    title: "רישיונות ותוכנות",
    subtitle: (cats, assets) => {
      const sw = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "SFT").length;
      const sub = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "MAN").length;
      return `${assets.length} פריטים · ${sw} תוכנות · ${sub} מנויים`;
    },
    icon: AppWindow,
    color: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", ring: "hover:ring-violet-500/30", soft: "bg-violet-500/5" },
  },
  digital: {
    key: "digital",
    title: "גישות דיגיטליות",
    subtitle: (_cats, assets) => `${assets.length} גישות פעילות`,
    icon: KeySquare,
    color: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", ring: "hover:ring-purple-500/30", soft: "bg-purple-500/5" },
  },
  physical: {
    key: "physical",
    title: "ציוד פיזי",
    subtitle: (_cats, assets) => {
      const inUse = assets.filter((a) => a.status === "in_use").length;
      const inStock = assets.filter((a) => a.status === "in_stock").length;
      return `${assets.length} פריטים · ${inUse} בשימוש · ${inStock} במלאי`;
    },
    icon: Monitor,
    color: { bg: "bg-sky-500/10", text: "text-sky-600 dark:text-sky-400", ring: "hover:ring-sky-500/30", soft: "bg-sky-500/5" },
  },
  real_estate: {
    key: "real_estate",
    title: 'נדל"ן וחוזים',
    subtitle: (_cats, assets) => {
      const tenant = assets.filter((a) => (a.custom_fields as any)?.["כיוון חוזה"] === "החברה שוכרת").length;
      const landlord = assets.filter((a) => (a.custom_fields as any)?.["כיוון חוזה"] === "החברה משכירה").length;
      return `${assets.length} נכסים · ${tenant} שוכרים · ${landlord} משכירים`;
    },
    icon: Building,
    color: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", ring: "hover:ring-amber-500/30", soft: "bg-amber-500/5" },
  },
  trainings: {
    key: "trainings",
    title: "הדרכות ותחזוקה",
    subtitle: (_cats, assets) => `${assets.length} פריטי הדרכה/תחזוקה`,
    icon: GraduationCap,
    color: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", ring: "hover:ring-pink-500/30", soft: "bg-pink-500/5" },
  },
  insurance: {
    key: "insurance",
    title: "ביטוחים ורגולציה",
    subtitle: (cats, assets) => {
      const insCount = assets.filter((a) => {
        const c = cats.find((cc) => cc.id === a.category_id);
        return c?.prefix === "CINS" || c?.protocol_type === "insurance";
      }).length;
      const certCount = assets.filter((a) => cats.find((c) => c.id === a.category_id)?.prefix === "CERT").length;
      return `${insCount} ביטוחים · ${certCount} אישורים`;
    },
    icon: ShieldCheck,
    color: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", ring: "hover:ring-emerald-500/30", soft: "bg-emerald-500/5" },
  },
};

const DOMAIN_ORDER: DomainKey[] = ["physical", "digital", "licenses", "trainings", "insurance", "real_estate"];

export function DomainsGrid({ onSelectCategory, onQuickAssign }: Props) {
  const { data: categories, isLoading } = useAssetCategories();
  const { data: assets } = useAssets();
  const { data: expiring } = useExpiringAssets(30);
  const { data: tickets } = useITTickets();

  const grouped = useMemo(() => {
    const cats = categories ?? [];
    const all = assets ?? [];
    return DOMAINS.map((d) => {
      const domainCats = cats.filter(d.match);
      const catIds = new Set(domainCats.map((c) => c.id));
      const domainAssets = all.filter((a: any) => catIds.has(a.category_id));
      const domainExpiring = (expiring ?? []).filter((e) =>
        domainCats.some((c) => c.id === e.category_id)
      );
      const expired = domainExpiring.filter((e) => e.days_left <= 0).length;
      const soon = domainExpiring.filter((e) => e.days_left > 0 && e.days_left <= 14).length;
      return { def: d, cats: domainCats, assets: domainAssets, expired, soon };
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
          {grouped.map(({ def, cats, assets, expired, soon }) => {
            const Icon = def.icon;
            const badge = expired > 0
              ? { text: `${expired} פגי תוקף`, cls: "bg-destructive/10 text-destructive" }
              : soon > 0
              ? { text: `חידוש תוך 14 יום`, cls: "bg-warning/10 text-warning" }
              : null;

            return (
              <div
                key={def.key}
                className={cn(
                  "group relative bg-card border border-border rounded-2xl p-5",
                  "hover:shadow-lg hover:-translate-y-0.5 hover:ring-2 transition-all",
                  def.color.ring
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
                    <h3 className="text-base font-semibold leading-tight">{def.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{def.subtitle(cats, assets)}</p>
                  </div>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    def.color.bg, def.color.text
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                </div>

                {/* Sub-category chips */}
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {cats.length === 0 ? (
                    <span className="text-[11px] text-muted-foreground italic">אין קטגוריות עדיין</span>
                  ) : (
                    cats.slice(0, 6).map((c) => {
                      const count = assets.filter((a: any) => a.category_id === c.id).length;
                      return (
                        <button
                          key={c.id}
                          onClick={() => onSelectCategory(c.id)}
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors",
                            def.color.text
                          )}
                        >
                          <span>{c.category_name}</span>
                          <span className="text-muted-foreground">{count}</span>
                        </button>
                      );
                    })
                  )}
                  {cats.length > 6 && (
                    <span className="inline-flex items-center text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground">
                      +{cats.length - 6}
                    </span>
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
