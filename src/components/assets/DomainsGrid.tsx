import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAssets, useAssetCategories, useITTickets } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";

import { useExpiringAssets } from "@/hooks/useExpiringAssets";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  DOMAIN_META,
  DOMAIN_ORDER,
  domainKeyToSlug,
  getDomain,
  type DomainKey,
} from "@/lib/assetDomains";
import { getAllDomainLabels, type DomainLabels } from "@/lib/domainConfig";
import {
  AlertTriangle,
  Users,
  Clock,
  ArrowLeftRight,
  Pencil,
  FolderTree,
  Check,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { RowContextMenu, copyAction, openInNewTab, type ContextAction } from "@/components/context/RowContextMenu";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExpiringResourcesDialog } from "@/components/assets/ExpiringResourcesDialog";
import { expiryClickAction, getExpiringResourceTargets, type ExpiringResourceTarget } from "@/lib/expiringResourceTargets";

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
  const { data: assetGroups } = useAssetGroups();

  const { activeCompany, activeCompanyId, refetchCompanies } = useCompany();
  const { isAdmin, isOperations } = useAuth();
  const canManage = isAdmin || isOperations;

  const [editingKey, setEditingKey] = useState<DomainKey | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editHint, setEditHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [expiryListOpen, setExpiryListOpen] = useState(false);
  // A domain's "renew within 14 days" badge opens its own list, not the 30-day one.
  const [domainSoon, setDomainSoon] = useState<{ title: string; targets: ExpiringResourceTarget[] } | null>(null);
  const [expandedDomains, setExpandedDomains] = useState<Set<DomainKey>>(new Set());

  const domainLabels = (activeCompany?.domain_labels ?? null) as DomainLabels | null;
  const labels = useMemo(() => getAllDomainLabels(domainLabels), [domainLabels]);

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
      const soonItems = domainExpiring.filter((e) => e.days_left > 0 && e.days_left <= 14);
      const soon = soonItems.length;
      const subCount = (assetGroups ?? []).filter((g: any) => catIds.has(g.category_id)).length;
      return { meta, cats: sortedCats, assets: domainAssets, expired, soon, soonItems, subCount };
    });
  }, [categories, assets, expiring, assetGroups]);


  const totalExpired = (expiring ?? []).filter((e) => e.days_left <= 0).length;
  const soonTargets = useMemo(() => getExpiringResourceTargets(
    (expiring ?? []).filter((e) => e.days_left > 0 && e.days_left <= 30),
    categories ?? [],
  ), [expiring, categories]);
  const totalSoon30 = soonTargets.length;
  const openSoonResources = () => {
    const action = expiryClickAction(soonTargets);
    if (action.type === "navigate") navigate(action.href);
    else setExpiryListOpen(true);
  };
  const openOffboardings = (tickets ?? []).filter((t: any) => t.ticket_type === "offboarding" && t.status !== "done").length;

  const startEdit = (key: DomainKey) => {
    setEditingKey(key);
    setEditTitle(labels[key].title);
    setEditHint(labels[key].hint);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditTitle("");
    setEditHint("");
  };

  const saveEdit = async (key: DomainKey) => {
    if (!activeCompanyId) return;
    setSaving(true);
    try {
      const nextLabels: DomainLabels = { ...(domainLabels ?? {}) };
      nextLabels[key] = { title: editTitle.trim(), hint: editHint.trim() };
      const { error } = await supabase
        .from("companies")
        .update({ domain_labels: nextLabels as any })
        .eq("id", activeCompanyId);
      if (error) throw error;
      await refetchCompanies();
      toast({ title: "השינויים נשמרו" });
      cancelEdit();
    } catch (err: any) {
      toast({ title: "שגיאה בשמירה", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <span className="sr-only">טוען דומיינים…</span>
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
      </div>
    );
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
          <Button variant="outline" size="sm" onClick={openSoonResources}
            title="פתח את המשאבים שתוקפם פג תוך 30 יום"
            className="h-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-warning/10 text-warning border border-warning/20 text-xs font-medium hover:bg-warning/20 hover:text-warning">
            <Clock className="w-3.5 h-3.5" />
            {totalSoon30} פגים תוך 30 יום
          </Button>
        )}
        {totalExpired > 0 && (() => {
          const first = grouped.find((g) => g.expired > 0);
          return (
            <button
              type="button"
              title="הצג את הפריטים שפג תוקפם"
              onClick={() => first && navigate(`/assets/${domainKeyToSlug(first.meta.key)}?expired=1`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 text-xs font-medium cursor-pointer hover:bg-destructive/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {totalExpired} פריטים פגי תוקף
            </button>
          );
        })()}
      </div>

      <ExpiringResourcesDialog open={expiryListOpen} onOpenChange={setExpiryListOpen} targets={soonTargets} />
      <ExpiringResourcesDialog
        open={!!domainSoon}
        onOpenChange={(o) => { if (!o) setDomainSoon(null); }}
        targets={domainSoon?.targets ?? []}
        title={domainSoon?.title}
      />

      {/* Domain cards */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground mb-3 text-right">6 דומיינים</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.map(({ meta, cats, assets, expired, soon, soonItems, subCount }) => {
            const Icon = meta.icon;
            const badge = expired > 0
              ? { text: `${expired} פגי תוקף`, cls: "bg-destructive/10 text-destructive" }
              : soon > 0
              ? { text: `חידוש תוך 14 יום`, cls: "bg-warning/10 text-warning" }
              : null;

            const slug = domainKeyToSlug(meta.key);
            const openDomain = () => navigate(`/assets/${slug}`);
            const isEmpty = cats.length === 0;
            const label = labels[meta.key];
            const isEditing = editingKey === meta.key;

            if (isEditing) {
              return (
                <div
                  key={meta.key}
                  className={cn(
                    "relative bg-card border border-primary/40 rounded-2xl p-5 text-right",
                    meta.color.ring
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                      meta.color.bg, meta.color.text
                    )}>
                      <Icon className="w-6 h-6" strokeWidth={1.75} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Input
                      aria-label="כותרת הדומיין"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="כותרת הדומיין"
                      dir="rtl"
                      className="text-right"
                    />
                    <Textarea
                      aria-label="תיאור קצר של הדומיין"
                      value={editHint}
                      onChange={(e) => setEditHint(e.target.value)}
                      placeholder="תיאור קצר"
                      dir="rtl"
                      className="text-right resize-none"
                      rows={2}
                    />
                    <div className="flex items-center gap-2 justify-end pt-1">
                      <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                        <X className="w-4 h-4 ml-1" />
                        ביטול
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(meta.key)} disabled={saving || !editTitle.trim()}>
                        <Check className="w-4 h-4 ml-1" />
                        שמירה
                      </Button>
                    </div>
                  </div>
                </div>
              );
            }

            const domainMenuActions: ContextAction[] = [
              { label: "פתח את הדומיין", onSelect: openDomain },
              { label: "פתח בכרטיסייה חדשה", onSelect: () => openInNewTab(`/assets/${slug}`) },
              {
                label: "הצג פריטים פגי תוקף",
                when: expired > 0,
                onSelect: () => navigate(`/assets/${slug}?expired=1`),
              },
              {
                label: "ערוך תווית דומיין",
                roles: ["super_admin", "operations"],
                separator: true,
                onSelect: () => startEdit(meta.key),
              },
              {
                label: "עריכה מהירה — קטגוריות ותתי-קטגוריות",
                roles: ["super_admin", "operations"],
                onSelect: () => navigate(`/assets?tab=categories&domain=${meta.key}`),
              },
              copyAction("העתק שם דומיין", label.title, true),
            ];

            return (
              <RowContextMenu key={meta.key} actions={domainMenuActions}>
              <div
                role="button"
                tabIndex={0}
                onClick={openDomain}
                onKeyDown={(e) => {
                  // Only the card itself: Enter on a nested button must activate that button.
                  if (e.target !== e.currentTarget) return;
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
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (expired > 0) {
                        navigate(`/assets/${slug}?expired=1`);
                        return;
                      }
                      const targets = getExpiringResourceTargets(soonItems, categories ?? []);
                      const action = expiryClickAction(targets);
                      if (action.type === "navigate") navigate(action.href);
                      else setDomainSoon({ title: `${label.title}: חידוש תוך 14 יום`, targets });
                    }}
                    title={expired > 0 ? "הצג את הפריטים שפג תוקפם" : "הצג את הפריטים שתוקפם פג תוך 14 יום"}
                    className={cn(
                      "absolute top-3 left-3 inline-flex items-center gap-1 min-h-8 text-xs font-medium px-2.5 py-1 rounded-full transition-shadow hover:ring-2 hover:ring-current/30 cursor-pointer",
                      badge.cls
                    )}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {badge.text}
                  </button>
                )}

                {canManage && (
                  <div
                    className={cn(
                      // Always visible on touch screens; on desktop they appear on hover or keyboard focus.
                      "absolute left-3 flex items-center gap-1 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                      badge ? "bottom-3" : "top-3"
                    )}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(meta.key);
                      }}
                      type="button"
                      className="w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-full flex items-center justify-center border border-border bg-background/80 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="ערוך תווית דומיין"
                      title="ערוך תווית דומיין"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/assets?tab=categories&domain=${meta.key}`);
                      }}
                      type="button"
                      className="w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 rounded-full flex items-center justify-center border border-border bg-background/80 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="עריכה מהירה של קטגוריות ותתי-קטגוריות"
                      title="עריכה מהירה — קטגוריות ותתי-קטגוריות"
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className={cn("flex items-start justify-between mb-3", badge && "ml-20")}>
                  <div className="flex-1 text-right pr-2">
                    <h3 className="text-base font-semibold leading-tight">{label.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isEmpty ? "אין פריטים בדומיין זה" : domainSubtitle(meta.key, cats, assets)}
                    </p>
                    {!isEmpty && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cats.length} קטגוריות · {subCount} תת-קטגוריות
                      </p>
                    )}

                  </div>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                    meta.color.bg, meta.color.text
                  )}>
                    <Icon className="w-6 h-6" strokeWidth={1.75} />
                  </div>
                </div>

                {/* Category chips */}
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {isEmpty ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); navigate("/assets?tab=categories"); }}
                      className="text-xs min-h-8 px-2.5 py-1 rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    >
                      + הוסף קטגוריה ראשונה
                    </button>
                  ) : (
                    <>
                      {(expandedDomains.has(meta.key) ? cats : cats.slice(0, 6)).map((c) => (
                        <RowContextMenu
                          key={c.id}
                          actions={[
                            {
                              label: "פתח את הקטגוריה",
                              onSelect: () => navigate(`/assets/${slug}?cat=${c.id}`),
                            },
                            {
                              label: "פתח בכרטיסייה חדשה",
                              onSelect: () => openInNewTab(`/assets/${slug}?cat=${c.id}`),
                            },
                            {
                              label: "ערוך קטגוריה",
                              roles: ["super_admin", "operations"],
                              separator: true,
                              onSelect: () => navigate(`/assets?tab=categories&domain=${meta.key}`),
                            },
                            copyAction("העתק שם קטגוריה", c.category_name, true),
                          ]}
                        >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/assets/${slug}?cat=${c.id}`);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1 text-xs min-h-8 px-2.5 py-1 rounded-md border border-border bg-background hover:bg-muted transition-colors",
                            meta.color.text
                          )}
                        >
                          <span>{c.category_name}</span>
                          <span className="text-muted-foreground">{c._count ?? 0}</span>
                        </button>
                        </RowContextMenu>
                      ))}
                      {cats.length > 6 && (
                        <button
                          type="button"
                          aria-expanded={expandedDomains.has(meta.key)}
                          aria-label={expandedDomains.has(meta.key) ? "הצג פחות קטגוריות" : `הצג עוד ${cats.length - 6} קטגוריות`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDomains((prev) => {
                              const next = new Set(prev);
                              if (next.has(meta.key)) next.delete(meta.key); else next.add(meta.key);
                              return next;
                            });
                          }}
                          className="inline-flex items-center text-xs min-h-8 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          {expandedDomains.has(meta.key) ? "פחות" : `+${cats.length - 6}`}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              </RowContextMenu>
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
