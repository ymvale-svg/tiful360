import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronLeft, ExternalLink } from "lucide-react";
import { useExpiringAssets, expiryUrgency, DOMAIN_LABELS, DOMAIN_STYLES, type ExpiringAsset, type ProtocolDomain } from "@/hooks/useExpiringAssets";
import { RenewExpiryDialog } from "@/components/RenewExpiryDialog";
import { getDomain, domainKeyToSlug } from "@/lib/assetDomains";
import { cn } from "@/lib/utils";

interface ExpiringAssetsCardProps {
  /** Limit the card to specific domains. Omit for all domains. */
  domains?: ProtocolDomain[];
  title?: string;
}

export function ExpiringAssetsCard({ domains, title }: ExpiringAssetsCardProps = {}) {
  const { data, isLoading } = useExpiringAssets(14);
  const [selected, setSelected] = useState<ExpiringAsset | null>(null);
  const navigate = useNavigate();

  const navigateToSource = (item: ExpiringAsset) => {
    if (item.source_type === "digital_access" && item.current_owner_id) {
      navigate(`/employees/${item.current_owner_id}?tab=assets`);
    } else if (item.asset_id) {
      navigate(`/assets/${domainKeyToSlug(getDomain({ domain: item.domain } as any))}/${item.asset_id}`);
    }
  };


  const allItems = data ?? [];
  const items = domains && domains.length > 0
    ? allItems.filter((i) => domains.includes(i.domain))
    : allItems;

  // get_expiring_assets filters on `expiry_date - CURRENT_DATE <= _days_ahead`
  // with no lower bound, so the list mixes items lapsing in the next 14 days
  // with items that lapsed long ago. Both belong here — an expired insurance is
  // the most urgent thing on the page — but the heading has to admit it.
  const overdue = items.filter((i) => i.days_left <= 0);
  const upcoming = items.filter((i) => i.days_left > 0);

  const heading = title
    ?? (domains && domains.length === 1
      ? `${DOMAIN_LABELS[domains[0]]} לחידוש`
      : "תוקפים לטיפול");

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          {heading}
        </h2>

        <div className="flex items-center gap-1.5">
          {overdue.length > 0 && (
            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-md">
              {overdue.length} פג תוקף
            </span>
          )}
          {upcoming.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md">
              {upcoming.length} תוך 14 יום
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">טוען...</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">אין תוקפים לטיפול 🎉</div>
        ) : (
          items.map((item) => {
            const urgency = expiryUrgency(item.days_left);
            const isLease = item.category_prefix === "LEASE";
            const direction = isLease ? (item.custom_fields as any)?.["כיוון חוזה"] : null;
            return (
              <button
                key={`${item.source_type}-${item.source_id}-${item.field_key ?? "main"}`}
                onClick={() => setSelected(item)}
                className="w-full text-right p-4 hover:bg-muted/40 transition-colors flex items-center gap-3"
              >
                <div className={cn("w-2 h-12 rounded-full shrink-0", urgency.bg.replace("/10", ""))} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{item.asset_name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{item.asset_code}</span>
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px]", DOMAIN_STYLES[item.domain] ?? DOMAIN_STYLES.physical)}>
                      {DOMAIN_LABELS[item.domain] ?? item.domain}
                    </span>
                    {!item.is_assignable && (
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">מוסדי</span>
                    )}
                    {direction && (
                      <span className="px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px]">
                        {direction === "החברה שוכרת" ? "שוכרים" : "משכירים"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{item.field_label}</span>
                    <span>· {new Date(item.expiry_date).toLocaleDateString("en-GB")}</span>
                    {item.is_assignable && item.owner_name && <span>· {item.owner_name}</span>}
                  </div>
                </div>
                <div className={cn("shrink-0 text-xs font-medium px-2 py-1 rounded-md border", urgency.color, urgency.bg, urgency.border)}>
                  {urgency.label}
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); navigateToSource(item); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); navigateToSource(item); } }}
                  title="פתח פריט"
                  className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-4 h-4" />
                </span>
                <ChevronLeft className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })
        )}
      </div>

      <RenewExpiryDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        item={selected}
      />
    </div>
  );
}
