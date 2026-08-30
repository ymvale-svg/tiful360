import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
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
import { OWNER_ROLE_LABEL, OWNER_ROLE_OPTIONS } from "@/lib/domainConfig";
import { CheckCircle2, Printer, Package } from "lucide-react";

interface Props {
  process: OnboardingProcess | null;
  onOpenChange: (open: boolean) => void;
}

const FULFILLMENT_OPTIONS = [
  { value: "stock", label: "מהמלאי" },
  { value: "purchase", label: "רכש חדש" },
];

export function OnboardingChecklist({ process, onOpenChange }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: assets = [] } = useAssets();
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const upsertItem = useUpsertOnboardingItem();
  const updateProcess = useUpdateOnboardingProcess();
  const [ownerFilter, setOwnerFilter] = useState<string>("");

  const items = useMemo(
    () => [...(process?.onboarding_items ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [process]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, typeof items>>();
    for (const it of items) {
      const cat = (categories as any[]).find((c) => c.id === it.catalog_ref_id);
      const group = groups.find((g) => g.id === it.selected_group_id);
      const catName = cat?.category_name || "כללי";
      const subName = group?.name || "—";
      if (!map.has(catName)) map.set(catName, new Map());
      const subMap = map.get(catName)!;
      if (!subMap.has(subName)) subMap.set(subName, [] as any);
      (subMap.get(subName) as any).push(it);
    }
    return Array.from(map.entries()).map(([category, subMap]) => ({
      category,
      subs: Array.from(subMap.entries()),
    }));
  }, [items, categories, groups]);

  if (!process) return null;

  const emp = process.employees;
  const dLeft = daysUntil(emp?.start_date);
  const doneCount = items.filter((i) => i.status === "done").length;

  const assetOptions = (categoryId: string | null, groupId: string | null) =>
    (assets as any[])
      .filter(
        (a) =>
          (!categoryId || a.category_id === categoryId) &&
          (!groupId || a.group_id === groupId) &&
          !a.current_owner_id
      )
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
    win.document.write(buildHandoutHtml(process, items, assets as any[], categories as any[], groups as any[]));
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

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 mb-3">
          <span className="text-sm text-muted-foreground">
            {doneCount}/{items.length} הושלמו · סטטוס: {ONBOARDING_STATUS_LABEL[process.status]}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <SearchableSelect
              value={ownerFilter}
              onChange={setOwnerFilter}
              options={[{ value: "", label: "כל האחראים" }, ...OWNER_ROLE_OPTIONS]}
              placeholder="סנן לפי אחראי"
            />
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
          {grouped.map(({ category, subs }) => (
            <div key={category} className="border border-border/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">{category}</h3>
              <div className="space-y-4">
                {subs.map(([subName, subItems]) => (
                  <div key={subName} className="rounded-lg bg-muted/30 p-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">{subName}</h4>
                    <div className="space-y-3">
                      {subItems
                        .filter((item: any) => !ownerFilter || item.owner_role === ownerFilter)
                        .map((item: any) => (
                          <div key={item.id} className="rounded-lg bg-muted/40 p-3">
                            <div className="flex items-start gap-2.5">
                              <Checkbox
                                checked={item.status === "done"}
                                onCheckedChange={(v) => completeItem(item, !!v)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-sm font-medium ${item.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                    {OWNER_ROLE_LABEL[item.owner_role] ?? item.owner_role}
                                  </span>
                                </div>
                                {item.notes && (
                                  <p className="text-xs mt-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-foreground flex items-start gap-1.5">
                                    <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                                    <span><span className="font-medium">הערה לתפעול: </span>{item.notes}</span>
                                  </p>
                                )}
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
                                    options={assetOptions(item.catalog_ref_id, item.selected_group_id)}
                                    placeholder="בחר פריט מהמלאי"
                                  />
                                </div>
                                {item.asset_id && (() => {
                                  const a = (assets as any[]).find((x) => x.id === item.asset_id);
                                  if (!a) return null;
                                  return (
                                    <div className="mt-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-0.5">
                                      <span>פריט: <span className="font-medium text-foreground">{a.asset_name}</span></span>
                                      <span>מזהה: <span className="font-mono text-foreground">{a.asset_code}</span></span>
                                      {a.serial_number && <span>סידורי: <span className="font-mono text-foreground">{a.serial_number}</span></span>}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
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

function buildHandoutHtml(process: OnboardingProcess, items: any[], assets: any[], categories: any[], groups: any[]) {
  const emp = process.employees;
  const today = new Date().toLocaleDateString("en-GB");

  const byCategory = new Map<string, Map<string, typeof items>>();
  for (const it of items) {
    const cat = categories.find((c: any) => c.id === it.catalog_ref_id);
    const group = groups.find((g) => g.id === it.selected_group_id);
    const catName = cat?.category_name || "כללי";
    const subName = group?.name || "—";
    if (!byCategory.has(catName)) byCategory.set(catName, new Map());
    const subMap = byCategory.get(catName)!;
    if (!subMap.has(subName)) subMap.set(subName, [] as any);
    (subMap.get(subName) as any).push(it);
  }

  let sections = "";
  byCategory.forEach((subMap, catName) => {
    let rows = "";
    subMap.forEach((subItems, subName) => {
      rows += subItems
        .map((i: any) => {
          const a = assets.find((x: any) => x.id === i.asset_id);
          return `<tr>
            <td style="text-align:center;"><span class="checkbox"></span></td>
            <td>${esc(i.title)}</td>
            <td style="font-family:monospace;">${esc(a?.asset_code)}</td>
            <td style="font-family:monospace;">${esc(a?.serial_number)}</td>
            <td>${esc(i.notes)}</td>
          </tr>`;
        })
        .join("");
    });
    sections += `<h3>${esc(catName)}</h3>
<table><thead><tr><th>נמסר</th><th>פריט</th><th>מזהה</th><th>מספר סידורי</th><th>הערות</th></tr></thead>
<tbody>${rows}</tbody></table>`;
  });

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="UTF-8">
<title>פרוטוקול מסירת ציוד - ${esc(emp?.full_name)}</title>
<style>
 body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1a1a1a;}
 h1{text-align:center;color:#2563eb;border-bottom:3px solid #2563eb;padding-bottom:12px;}
 h2{color:#374151;margin-top:24px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;}
 h3{color:#4b5563;margin-top:18px;font-size:16px;}
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
${sections}
<h2>הצהרה</h2>
<p style="font-size:14px;"><span class="checkbox"></span> אני מאשר/ת שקיבלתי את הציוד המפורט לעיל במצב תקין ומתחייב/ת לשמור עליו ולהחזירו בתום העסקתי.</p>
<div class="sig"><div>חתימת העובד</div><div>חתימת מוסר הציוד</div></div>
<div class="footer">מסמך זה הופק אוטומטית בתאריך ${today}</div>
</body></html>`;
}
