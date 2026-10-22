import { Link } from "react-router-dom";
import { ArrowUpLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatDateDMY } from "@/lib/utils";
import type { ExpiringResourceTarget } from "@/lib/expiringResourceTargets";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ExpiringResourceTarget[];
}

export function ExpiringResourcesDialog({ open, onOpenChange, targets }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-hidden">
        <DialogHeader className="pl-8 text-right">
          <DialogTitle className="tracking-normal">משאבים שתוקפם פג תוך 30 יום</DialogTitle>
          <DialogDescription>{targets.length} משאבים</DialogDescription>
        </DialogHeader>
        <ul className="divide-y divide-border overflow-y-auto max-h-[60dvh]" aria-label="משאבים קרובים לפקיעת תוקף">
          {targets.map(({ key, item, expiries, href }) => (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1 basis-48 space-y-1">
                <p className="font-semibold break-words">{item.asset_name}</p>
                <p className="text-sm text-muted-foreground break-words">{[item.category_name, item.asset_code, item.owner_name].filter(Boolean).join(" · ")}</p>
                {expiries.map((expiry, index) => (
                  <p key={`${expiry.source_type}:${expiry.source_id}:${expiry.field_key}:${index}`} className="text-sm break-words">
                    {expiry.field_label} · <time dateTime={expiry.expiry_date}>{formatDateDMY(expiry.expiry_date)}</time>
                  </p>
                ))}
              </div>
              {href ? (
                <Button asChild variant="outline" size="sm" className="shrink-0 border-link-category bg-link-category-bg text-link-category hover:bg-link-category-bg hover:text-link-category">
                  <Link to={href} onClick={() => onOpenChange(false)} aria-label={`פתח משאב: ${item.asset_name}`}>
                    <ArrowUpLeft aria-hidden="true" />פתח משאב
                  </Link>
                </Button>
              ) : <span className="text-sm text-muted-foreground">אין כרטיס משאב מקושר</span>}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}