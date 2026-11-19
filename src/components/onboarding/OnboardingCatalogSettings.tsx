import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/hooks/use-toast";
import { useAssetCategories } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { updateCategoryOnboarding } from "@/services/onboarding";
import {
  resolveTrack,
  showInOnboarding,
  TRACK_HINT,
  TRACK_LABEL,
  type FulfillmentTrack,
} from "@/domain/onboarding/tracks";
import { DOMAIN_META, getDomain } from "@/lib/assetDomains";

const TRACKS: FulfillmentTrack[] = ["equipment", "access", "vehicle", "license", "task", "none"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Catalog managers choose, per category, whether HR sees it in onboarding and how it is fulfilled. */
export function OnboardingCatalogSettings({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: categories = [] } = useAssetCategories();
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .filter((c) => !q || (c.category_name ?? "").toLowerCase().includes(q))
      .map((c) => ({ c, track: resolveTrack(c), shown: showInOnboarding(c) }));
  }, [categories, query]);

  const save = async (categoryId: string, patch: { fulfillment_track?: string; show_in_onboarding?: boolean }) => {
    setSavingId(categoryId);
    try {
      await updateCategoryOnboarding(supabase, categoryId, patch);
      await qc.invalidateQueries({ queryKey: ["asset-categories"] });
    } catch (e) {
      toast({ title: "השינוי לא נשמר", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>קטלוג הקליטה</DialogTitle>
          <DialogDescription>
            אילו קטגוריות משאבי אנוש רואה בטופס הקליטה, ואיך כל פריט מבוצע.
          </DialogDescription>
        </DialogHeader>

        <SearchInput
          label="חיפוש קטגוריה"
          placeholder="חיפוש קטגוריה"
          value={query}
          onValueChange={setQuery}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th scope="col" className="text-start font-medium py-2 px-2">קטגוריה</th>
                <th scope="col" className="text-start font-medium py-2 px-2">תחום</th>
                <th scope="col" className="text-start font-medium py-2 px-2">מסלול ביצוע</th>
                <th scope="col" className="text-start font-medium py-2 px-2">מופיע בקליטה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, track, shown }) => (
                <tr key={c.id} className="border-b border-border/60" aria-busy={savingId === c.id || undefined}>
                  <th scope="row" className="text-start font-medium py-2 px-2">{c.category_name}</th>
                  <td className="py-2 px-2 text-muted-foreground">{DOMAIN_META[getDomain(c)].title}</td>
                  <td className="py-2 px-2">
                    <select
                      value={track}
                      onChange={(e) => { void save(c.id, { fulfillment_track: e.target.value }); }}
                      disabled={savingId === c.id}
                      aria-label={`מסלול ביצוע ל${c.category_name}`}
                      title={TRACK_HINT[track]}
                      className="min-h-9 px-2 bg-card border border-border rounded-lg text-sm"
                    >
                      {TRACKS.map((t) => (
                        <option key={t} value={t}>{TRACK_LABEL[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <Switch
                      checked={shown}
                      onCheckedChange={(v) => { void save(c.id, { show_in_onboarding: v }); }}
                      disabled={savingId === c.id}
                      aria-label={`${c.category_name} מופיע בקליטה`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
