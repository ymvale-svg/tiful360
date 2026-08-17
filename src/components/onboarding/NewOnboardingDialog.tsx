import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useEmployees, useAssetCategories, useAssets } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import {
  useCreateOnboardingProcess,
  useRoleTemplates,
  type NewOnboardingItem,
} from "@/hooks/useOnboarding";
import { getDomain, DOMAIN_META, type DomainKey } from "@/lib/assetDomains";
import { Send, Copy, UserPlus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OWNER_BY_DOMAIN: Record<DomainKey, string> = {
  physical: "it_manager",
  digital: "it_manager",
  licenses: "it_manager",
  training: "hr",
  insurance: "operations",
  real_estate: "operations",
};

export function NewOnboardingDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const { data: assets = [] } = useAssets();
  const { data: templates = [] } = useRoleTemplates();
  const create = useCreateOnboardingProcess();

  const [employeeId, setEmployeeId] = useState("");
  const [selected, setSelected] = useState<Record<string, { groupId: string; notes: string }>>({});
  const [copyFromId, setCopyFromId] = useState("");

  useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setSelected({});
      setCopyFromId("");
    }
  }, [open]);

  const employee = employees.find((e: any) => e.id === employeeId);

  // Pre-load from a matching role template when picking the employee.
  useEffect(() => {
    if (!employee) return;
    const tpl =
      templates.find((t) => t.role_name === (employee as any).role && t.department === (employee as any).department) ??
      templates.find((t) => t.role_name === (employee as any).role && !t.department);
    if (!tpl) return;
    const next: Record<string, { groupId: string; notes: string }> = {};
    (tpl.default_items ?? []).forEach((i) => {
      if (i.catalog_ref_id) next[i.catalog_ref_id] = { groupId: i.selected_group_id ?? "", notes: i.notes ?? "" };
    });
    setSelected(next);
  }, [employeeId, templates]);

  const blocks = useMemo(() => {
    const byBlock = new Map<string, any[]>();
    for (const c of categories as any[]) {
      const key = c.onboarding_form_group || DOMAIN_META[getDomain(c)].title;
      if (!byBlock.has(key)) byBlock.set(key, []);
      byBlock.get(key)!.push(c);
    }
    return Array.from(byBlock.entries()).map(([title, cats]) => ({ title, cats }));
  }, [categories]);

  const employeeOptions = useMemo(
    () =>
      (employees as any[])
        .filter((e) => e.status === "onboarding" || e.status === "active")
        .map((e) => ({ value: e.id, label: `${e.full_name} · ${e.role ?? ""}` })),
    [employees]
  );

  const groupOptions = (categoryId: string) =>
    groups.filter((g) => g.category_id === categoryId).map((g) => ({ value: g.id, label: g.name }));

  const toggle = (categoryId: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[categoryId]) delete next[categoryId];
      else next[categoryId] = { groupId: "", notes: "" };
      return next;
    });

  const copyFromEmployee = (sourceId: string) => {
    setCopyFromId(sourceId);
    const theirs = (assets as any[]).filter((a) => a.current_owner_id === sourceId);
    const next: Record<string, { groupId: string; notes: string }> = { ...selected };
    theirs.forEach((a) => {
      next[a.category_id] = { groupId: a.group_id ?? "", notes: "" };
    });
    setSelected(next);
    toast({ title: "הועתק", description: `נבחרו ${theirs.length} פריטים מהעובד שנבחר` });
  };

  const buildItems = (): NewOnboardingItem[] =>
    Object.entries(selected).map(([categoryId, val]) => {
      const cat = (categories as any[]).find((c) => c.id === categoryId);
      const domain = getDomain(cat);
      const groupName = groups.find((g) => g.id === val.groupId)?.name;
      return {
        title: groupName ? `${cat?.category_name} · ${groupName}` : cat?.category_name ?? "פריט",
        owner_role: OWNER_BY_DOMAIN[domain],
        item_type: domain === "digital" ? "access" : domain === "licenses" ? "license" : "asset",
        catalog_ref_id: categoryId,
        selected_group_id: val.groupId || null,
        notes: val.notes || null,
      };
    });

  const submit = async (status: "draft" | "sent") => {
    if (!employeeId) {
      toast({ title: "בחר עובד", variant: "destructive" });
      return;
    }
    const items = buildItems();
    if (!items.length) {
      toast({ title: "בחר לפחות פריט אחד", variant: "destructive" });
      return;
    }
    try {
      await create.mutateAsync({ employee_id: employeeId, items, status });
      toast({
        title: status === "sent" ? "נשלח לתפעול" : "נשמר כטיוטה",
        description: `${items.length} פריטים בתהליך הקליטה`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            תהליך קליטת עובד
          </DialogTitle>
          <DialogDescription>בחר את העובד ואת המשאבים הנדרשים לו ליום הראשון</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">עובד נקלט</label>
              <SearchableSelect value={employeeId} onChange={setEmployeeId} options={employeeOptions} />
              {employee && (
                <p className="text-xs text-muted-foreground mt-1">
                  תחילת עבודה: {(employee as any).start_date
                    ? new Date((employee as any).start_date).toLocaleDateString("en-GB")
                    : "—"}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" /> העתק צרכים מעובד קיים
              </label>
              <SearchableSelect
                value={copyFromId}
                onChange={copyFromEmployee}
                options={(employees as any[]).map((e) => ({ value: e.id, label: e.full_name }))}
                placeholder="בחר עובד להעתקה..."
              />
            </div>
          </div>

          {blocks.map((block) => (
            <div key={block.title} className="border border-border/60 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3">{block.title}</h3>
              <div className="space-y-2">
                {block.cats.map((c: any) => {
                  const sel = selected[c.id];
                  const gOpts = groupOptions(c.id);
                  return (
                    <div key={c.id} className="rounded-lg bg-muted/40 p-2.5">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <Checkbox checked={!!sel} onCheckedChange={() => toggle(c.id)} />
                        <span className="text-sm">{c.category_name}</span>
                      </label>
                      {sel && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pr-7">
                          {gOpts.length > 0 && (
                            <SearchableSelect
                              value={sel.groupId}
                              onChange={(v) =>
                                setSelected((p) => ({ ...p, [c.id]: { ...p[c.id], groupId: v } }))
                              }
                              options={gOpts}
                              placeholder="דגם / קבוצה (אופציונלי)"
                            />
                          )}
                          <input
                            value={sel.notes}
                            onChange={(e) =>
                              setSelected((p) => ({ ...p, [c.id]: { ...p[c.id], notes: e.target.value } }))
                            }
                            placeholder="הערה לתפעול"
                            className="px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button variant="outline" onClick={() => submit("draft")} disabled={create.isPending}>
            שמור כטיוטה
          </Button>
          <Button onClick={() => submit("sent")} disabled={create.isPending} className="gap-2">
            <Send className="w-4 h-4" />
            שלח לתפעול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
