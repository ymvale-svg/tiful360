import { useMemo } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ONBOARDING_STATUS_LABEL,
  useUpdateOnboardingProcess,
  useUpsertOnboardingItem,
  daysUntil,
  type OnboardingProcess,
} from "@/hooks/useOnboarding";
import { getDomain, DOMAIN_META } from "@/lib/assetDomains";
import { CheckCircle2, Printer, Package } from "lucide-react";

interface Props {
  process: OnboardingProcess | null;
  onOpenChange: (open: boolean) => void;
}

const OWNER_LABEL: Record<string, string> = {
  it_manager: "IT",
  operations: "תפעול",
  hr: "משאבי אנוש",
};

const FULFILLMENT_OPTIONS = [
  { value: "stock", label: "מהמלאי" },
  { value: "purchase", label: "רכש חדש" },
];

export function OnboardingChecklist({ process, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: assets = [] } = useAssets();
  const { data: categories = [] } = useAssetCategories();
  const upsertItem = useUpsertOnboardingItem();
  const updateProcess = useUpdateOnboardingProcess();

  const items = useMemo(
    () => [...(process?.onboarding_items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [process]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, typeof items>();
    for (const it of items) {
      const cat = (categories as any[]).find((c) => c.id === it.catalog_ref_id);
      const key = cat ? DOMAIN_META[getDomain(cat)].title : "כללי";
      if (!map.has(key)) map.set(key, [] as any);
      (map.get(key) as any).push(it);
    }
    return Array.from(map.entries());
  }, [items, categories]);

  if (!process) return null;

  const emp = process.employees;
  const dLeft = daysUntil(emp?.start_date);
  const doneCount = items.filter((i) => i.status === "done").length;

  const assetOptions = (categoryId: string | null) =>
    (assets as any[])
      .filter((a) => (!categoryId || a.category_id === categoryId) && !a.current_owner_id)
      .map((a) => ({ value: a.id, label: `${a.asset_name} · ${a.asset_code}` }));

  const setItem = async (id: string, patch: any) => {
    try {
      await upsertItem.mutateAsync({ id, ...patch });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const completeItem = async (item: (typeof items)[number], checked: boolean) => {
    await setItem(item.id, { status: checked ? "done" : "pending" });
    if (checked && item.asset_id) {
      const { error } = await supabase
        .from("assets")
        .update({ current_owner_id: process.employee_id, status: "in_use" } as any)
        .eq("id", item.asset_id);
      if (error) {
        toast({ title: "שגיאה בהצמדת הפריט", description: error.message, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["employee-assets"] });
    }
    if (process.status === "sent" && checked) {
      updateProcess.mutate({ id: process.id, status: "in_progress" });
    }
  };

  const finish = async () => {
    await updateProcess.mutateAsync({
      id: process.id,
      status: "done",
      completed_at: new Date().toISOString(),
    });
    toast({ title: "תהליך הקליטה הושלם" });
  };

  const printProtocol = () => {
    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "שגיאה", description: "נא לאפשר חלונות קופצים", variant: "destructive" });
      return;
    }
    win.document.write(buildHandoutHtml(process, items, assets as any[]));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  return (
    <Sheet open={!!process} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>{emp?.full_name}</SheetTitle>
          <SheetDescription>
            {emp?.role} · {emp?.department} · תחילת עבודה{" "}
            {emp?.start_date ? new Date(emp.start_date).toLocaleDateString("en-GB") : "—"}
            {dLeft !== null && (
              <span className={dLeft <= 2 ? " text-destructive font-medium" : ""}>
                {" "}({dLeft >= 0 ? `בעוד ${dLeft} ימים` : `החל לפני ${Math.abs(dLeft)} ימים`})
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between mt-4 mb-3">
          <span className="text-sm text-muted-foreground">
            {doneCount}/{items.length} הושלמו · סטטוס: {ONBOARDING_STATUS_LABEL[process.status]}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={printProtocol}>
              <Printer className="w-4 h-4" /> פרוטוקול מסירה
            </Button>
            {process.status !== "done" && (
              <Button size="sm" className="gap-1.5" onClick={finish} disabled={doneCount < items.length}>
                <CheckCircle2 className="w-4 h-4" /> סיום תהליך
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {grouped.map(([title, groupItems]) => (
            <div key={title} className="border border-border/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">{title}</h3>
              <div className="space-y-3">
                {groupItems.map((item) => (
                  <div key={item.id} className="rounded-lg bg-muted/40 p-3">
                    <div className="flex items-start gap-2.5">
                      <Checkbox
                        checked={item.status === "done"}
                        onCheckedChange={(v) => completeItem(item, !!v)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {item.title}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                            {OWNER_LABEL[item.owner_role] ?? item.owner_role}
                          </span>
                        </div>
                        {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          <SearchableSelect
                            value={item.fulfillment_type ?? ""}
                            onChange={(v) => setItem(item.id, { fulfillment_type: v })}
                            options={FULFILLMENT_OPTIONS}
                            placeholder="אופן אספקה"
                          />
                          <SearchableSelect
                            value={item.asset_id ?? ""}
                            onChange={(v) => setItem(item.id, { asset_id: v })}
                            options={assetOptions(item.catalog_ref_id)}
                            placeholder="בחר פריט מהמלאי"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Package className="w-6 h-6" />
              אין פריטים בתהליך זה
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function esc(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHandoutHtml(process: OnboardingProcess, items: any[], assets: any[]) {
  const emp = process.employees;
  const today = new Date().toLocaleDateString("en-GB");
  const rows = items
    .map((i) => {
      const a = assets.find((x) => x.id === i.asset_id);
      return `<tr>
        <td style="text-align:center;"><span class="checkbox"></span></td>
        <td>${esc(i.title)}</td>
        <td style="font-family:monospace;">${esc(a?.asset_code)}</td>
        <td style="font-family:monospace;">${esc(a?.serial_number)}</td>
        <td></td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="UTF-8">
<title>פרוטוקול מסירת ציוד - ${esc(emp?.full_name)}</title>
<style>
 body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1a1a1a;}
 h1{text-align:center;color:#2563eb;border-bottom:3px solid #2563eb;padding-bottom:12px;}
 h2{color:#374151;margin-top:24px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;}
 table{width:100%;border-collapse:collapse;margin:12px 0;}
 th,td{border:1px solid #d1d5db;padding:10px 12px;text-align:right;font-size:14px;}
 th{background:#f3f4f6;font-weight:600;}
 .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;font-size:14px;}
 .checkbox{display:inline-block;width:16px;height:16px;border:1.5px solid #374151;}
 .sig{display:flex;justify-content:space-between;margin-top:60px;}
 .sig div{width:220px;border-top:1px solid #000;padding-top:8px;text-align:center;font-size:14px;}
 .footer{margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;}
</style></head><body>
<h1>פרוטוקול מסירת ציוד לעובד</h1>
<p style="text-align:center;color:#6b7280;">מסמך ${today}</p>
<h2>פרטי עובד</h2>
<div class="info-grid">
  <div>שם מלא: <strong>${esc(emp?.full_name)}</strong></div>
  <div>מזהה: ${esc(emp?.employee_code)}</div>
  <div>תפקיד: ${esc(emp?.role)}</div>
  <div>מחלקה: ${esc(emp?.department)}</div>
  <div>תחילת עבודה: ${emp?.start_date ? new Date(emp.start_date).toLocaleDateString("en-GB") : "—"}</div>
</div>
<h2>פריטים שנמסרו (${items.length})</h2>
<table><thead><tr><th>נמסר</th><th>פריט</th><th>מזהה</th><th>מספר סידורי</th><th>הערות</th></tr></thead>
<tbody>${rows}</tbody></table>
<h2>הצהרה</h2>
<p style="font-size:14px;"><span class="checkbox"></span> אני מאשר/ת שקיבלתי את הציוד המפורט לעיל במצב תקין ומתחייב/ת לשמור עליו ולהחזירו בתום העסקתי.</p>
<div class="sig"><div>חתימת העובד</div><div>חתימת מוסר הציוד</div></div>
<div class="footer">מסמך זה הופק אוטומטית בתאריך ${today}</div>
</body></html>`;
}
