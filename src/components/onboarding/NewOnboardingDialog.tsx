import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { useEmployees, useAssetCategories, useAssets } from "@/hooks/useData";
import { useAssetGroups, useCreateAssetGroup } from "@/hooks/useAssetGroups";
import { useAssetGroupModels, useCreateAssetGroupModel } from "@/hooks/useAssetGroupModels";
import {
  useCreateOnboardingProcess,
  useRoleTemplates,
  type NewOnboardingItem,
} from "@/hooks/useOnboarding";
import { getDomain, DOMAIN_META, type DomainKey } from "@/lib/assetDomains";
import { resolveOwnerRole, OWNER_ROLE_OPTIONS, OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import { Send, Copy, UserPlus, CalendarDays, AlertCircle, X } from "lucide-react";
import { EmployeeSetupWizard } from "@/components/EmployeeSetupWizard";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SelectedEntry = {
  groupIds: string[];
  notes: Record<string, string>;
  owners: Record<string, string>;
  /** groupId -> chosen model id (vehicle models etc.) */
  models: Record<string, string>;
};

export function NewOnboardingDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const { data: assets = [] } = useAssets();
  const { data: templates = [] } = useRoleTemplates();
  const { data: groupModels = [] } = useAssetGroupModels();
  const createGroup = useCreateAssetGroup();
  const createModel = useCreateAssetGroupModel();
  const create = useCreateOnboardingProcess();

  const [employeeId, setEmployeeId] = useState("");
  const [selected, setSelected] = useState<Record<string, SelectedEntry>>({});
  const [copyFromId, setCopyFromId] = useState("");
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Record<string, string>>({});
  const [quickModel, setQuickModel] = useState<Record<string, string>>({});


  useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setSelected({});
      setCopyFromId("");
      setQuickAdd({});
      setQuickModel({});
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
    const next: Record<string, SelectedEntry> = {};
    (tpl.default_items ?? []).forEach((i) => {
      if (!i.catalog_ref_id) return;
      const entry = next[i.catalog_ref_id] ?? { groupIds: [], notes: {}, owners: {}, models: {} };
      if (i.selected_group_id && !entry.groupIds.includes(i.selected_group_id)) {
        entry.groupIds.push(i.selected_group_id);
      }
      if (i.selected_group_id) {
        entry.owners[i.selected_group_id] = i.owner_role ?? "";
        if (i.selected_model_id) entry.models[i.selected_group_id] = i.selected_model_id;
      }
      next[i.catalog_ref_id] = entry;
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

  const groupsForCategory = (categoryId: string) =>
    groups.filter((g) => g.category_id === categoryId);

  const modelsForGroup = (groupId: string) =>
    groupModels.filter((m) => m.group_id === groupId && m.is_active);

  const toggleCategory = (categoryId: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[categoryId]) delete next[categoryId];
      else next[categoryId] = { groupIds: [], notes: {}, owners: {}, models: {} };
      return next;
    });

  const toggleGroup = (categoryId: string, groupId: string) =>
    setSelected((prev) => {
      const entry = prev[categoryId] ?? { groupIds: [], notes: {}, owners: {}, models: {} };
      const has = entry.groupIds.includes(groupId);
      const group = groups.find((g) => g.id === groupId);
      const cat = (categories as any[]).find((c) => c.id === categoryId);
      const next: SelectedEntry = {
        groupIds: has ? entry.groupIds.filter((id) => id !== groupId) : [...entry.groupIds, groupId],
        notes: { ...entry.notes },
        owners: { ...entry.owners },
        models: { ...(entry.models ?? {}) },
      };
      if (!has) {
        next.owners[groupId] = resolveOwnerRole(group, cat);
      } else {
        delete next.notes[groupId];
        delete next.owners[groupId];
        delete next.models[groupId];
      }
      return { ...prev, [categoryId]: next };
    });

  const setModel = (categoryId: string, groupId: string, modelId: string) =>
    setSelected((prev) => {
      const entry = prev[categoryId];
      if (!entry) return prev;
      return {
        ...prev,
        [categoryId]: { ...entry, models: { ...(entry.models ?? {}), [groupId]: modelId } },
      };
    });


  const setOwner = (categoryId: string, groupId: string, ownerRole: string) =>
    setSelected((prev) => {
      const entry = prev[categoryId];
      if (!entry) return prev;
      return {
        ...prev,
        [categoryId]: { ...entry, owners: { ...entry.owners, [groupId]: ownerRole } },
      };
    });

  const setNote = (categoryId: string, groupId: string, note: string) =>
    setSelected((prev) => {
      const entry = prev[categoryId];
      if (!entry) return prev;
      return {
        ...prev,
        [categoryId]: { ...entry, notes: { ...entry.notes, [groupId]: note } },
      };
    });

  const quickAddGroup = async (categoryId: string) => {
    const name = quickAdd[categoryId]?.trim();
    if (!name) return;
    const cat = (categories as any[]).find((c) => c.id === categoryId);
    try {
      const created = await createGroup.mutateAsync({
        category_id: categoryId,
        name,
        default_owner_role: cat?.default_owner_role || resolveOwnerRole(null, cat),
      });
      setQuickAdd((prev) => ({ ...prev, [categoryId]: "" }));
      toggleGroup(categoryId, created.id);
    } catch (e: any) {
      toast({ title: "שגיאה בהוספת תת-קטגוריה", description: e.message, variant: "destructive" });
    }
  };

  const quickAddModel = async (categoryId: string, groupId: string) => {
    const name = quickModel[groupId]?.trim();
    if (!name) return;
    try {
      const created = await createModel.mutateAsync({ group_id: groupId, name });
      setQuickModel((prev) => ({ ...prev, [groupId]: "" }));
      setModel(categoryId, groupId, created.id);
      toast({ title: "הדגם נוסף", description: name });
    } catch (e: any) {
      toast({ title: "שגיאה בהוספת דגם", description: e.message, variant: "destructive" });
    }
  };

  const copyFromEmployee = (sourceId: string) => {
    setCopyFromId(sourceId);
    const theirs = (assets as any[]).filter((a) => a.current_owner_id === sourceId);
    const next: Record<string, SelectedEntry> = { ...selected };
    theirs.forEach((a) => {
      const catId = a.category_id;
      const groupId = a.group_id;
      const entry = next[catId] ?? { groupIds: [], notes: {}, owners: {}, models: {} };
      if (groupId && !entry.groupIds.includes(groupId)) {
        entry.groupIds.push(groupId);
        const group = groups.find((g) => g.id === groupId);
        const cat = (categories as any[]).find((c) => c.id === catId);
        entry.owners[groupId] = resolveOwnerRole(group, cat);
      }
      next[catId] = entry;
    });
    setSelected(next);
    toast({ title: "הועתק", description: `נבחרו ${theirs.length} פריטים מהעובד שנבחר` });
  };

  const buildItems = (): NewOnboardingItem[] =>
    Object.entries(selected).flatMap(([categoryId, entry]) => {
      const cat = (categories as any[]).find((c) => c.id === categoryId);
      const domain = getDomain(cat);
      if (entry.groupIds.length === 0) {
        return [
          {
            title: cat?.category_name ?? "פריט",
            owner_role: resolveOwnerRole(null, cat),
            item_type: domain === "digital" ? "access" : domain === "licenses" ? "license" : "asset",
            catalog_ref_id: categoryId,
            selected_group_id: null,
            notes: null,
          },
        ];
      }
      return entry.groupIds.map((groupId) => {
        const group = groups.find((g) => g.id === groupId);
        const modelId = entry.models?.[groupId] || null;
        const model = modelId ? groupModels.find((m) => m.id === modelId) : null;
        const baseTitle = group
          ? `${cat?.category_name ?? "פריט"} · ${group.name}`
          : cat?.category_name ?? "פריט";
        return {
          title: model ? `${baseTitle} · ${model.name}` : baseTitle,
          owner_role: entry.owners[groupId] || resolveOwnerRole(group, cat),
          item_type: domain === "digital" ? "access" : domain === "licenses" ? "license" : "asset",
          catalog_ref_id: categoryId,
          selected_group_id: groupId,
          selected_model_id: modelId,
          notes: entry.notes[groupId]?.trim() || null,
        };
      });
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
      const proc = await create.mutateAsync({ employee_id: employeeId, items, status });
      if (status === "sent" && proc?.id) {
        const { error: mailErr } = await supabase.functions.invoke("notify-onboarding-process", {
          body: { process_id: proc.id },
        });
        if (mailErr) console.error("notify-onboarding-process failed", mailErr);
      }
      toast({
        title: status === "sent" ? "נשלח לתפעול" : "נשמר כטיוטה",
        description: `${items.length} פריטים בתהליך הקליטה`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const daysUntilStart = (startDate?: string | null) => {
    if (!startDate) return null;
    const ms = new Date(startDate).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  };

  return (
    <>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label className="text-sm font-medium mb-1.5 block">עובד נקלט</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect value={employeeId} onChange={setEmployeeId} options={employeeOptions} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="עובד חדש"
                    onClick={() => setNewEmployeeOpen(true)}
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </div>
                {employee && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">
                      תחילת עבודה: {(employee as any).start_date
                        ? new Date((employee as any).start_date).toLocaleDateString("en-GB")
                        : "לא הוזן"}
                    </p>
                    {(employee as any).start_date && (
                      <span className="text-xs font-medium">
                        {(() => {
                          const d = daysUntilStart((employee as any).start_date);
                          if (d === null) return null;
                          if (d < 0) return <span className="text-destructive">החל לפני {Math.abs(d)} ימים</span>;
                          if (d === 0) return <span className="text-amber-600">היום</span>;
                          return <span className="text-emerald-600">בעוד {d} ימים</span>;
                        })()}
                      </span>
                    )}
                  </div>
                )}
                {employee && !(employee as any).start_date && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-destructive">
                    <AlertCircle className="w-3.5 h-3.5" />
                    חסר תאריך תחילת עבודה בכרטיס העובד — יש לעדכן את הכרטיס לפני השליחה לתפעול.
                  </div>
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
                    const entry = selected[c.id];
                    const catGroups = groupsForCategory(c.id);
                    const hasGroups = catGroups.length > 0;
                    return (
                      <div key={c.id} className="rounded-lg bg-muted/40 p-2.5">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <Checkbox checked={!!entry} onCheckedChange={() => toggleCategory(c.id)} />
                          <span className="text-sm">{c.category_name}</span>
                        </label>
                        {entry && (
                          <div className="mt-2 pr-7 space-y-2">
                            {hasGroups ? (
                              <>
                                <div className="flex flex-wrap gap-1.5">
                                  {catGroups.map((g) => {
                                    const checked = entry.groupIds.includes(g.id);
                                    return (
                                      <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => toggleGroup(c.id, g.id)}
                                        className={`
                                          inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors
                                          ${checked
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background text-foreground border-border hover:bg-muted"}
                                        `}
                                      >
                                        {checked && <X className="w-3 h-3" />}
                                        {g.name}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    value={quickAdd[c.id] ?? ""}
                                    onChange={(e) => setQuickAdd((p) => ({ ...p, [c.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        quickAddGroup(c.id);
                                      }
                                    }}
                                    placeholder="＋ הוסף תת-קטגוריה..."
                                    className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => quickAddGroup(c.id)}
                                    disabled={!quickAdd[c.id]?.trim() || createGroup.isPending}
                                  >
                                    הוסף
                                  </Button>
                                </div>
                                {entry.groupIds.length === 0 && (
                                  <p className="text-xs text-muted-foreground">בחר לפחות תת-קטגוריה אחת</p>
                                )}
                                {entry.groupIds.map((groupId) => {
                                  const group = catGroups.find((g) => g.id === groupId);
                                  if (!group) return null;
                                  return (
                                    <div key={groupId} className="bg-background border border-border rounded-lg p-2 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium">{group.name}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-muted-foreground">אחראי:</span>
                                          <SearchableSelect
                                            value={entry.owners[groupId] || resolveOwnerRole(group, c)}
                                            onChange={(v) => setOwner(c.id, groupId, v)}
                                            options={OWNER_ROLE_OPTIONS}
                                          />
                                        </div>
                                      </div>
                                      {c.protocol_type === "vehicle" && (
                                        <div className="space-y-1.5 rounded-lg bg-muted/40 p-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground shrink-0">דגם:</span>
                                            <div className="flex-1 min-w-0">
                                              <SearchableSelect
                                                value={entry.models?.[groupId] ?? ""}
                                                onChange={(v) => setModel(c.id, groupId, v)}
                                                options={modelsForGroup(groupId).map((m) => ({
                                                  value: m.id,
                                                  label: m.manufacturer ? `${m.manufacturer} ${m.name}` : m.name,
                                                }))}
                                                placeholder="בחר דגם רכב..."
                                              />
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <input
                                              value={quickModel[groupId] ?? ""}
                                              onChange={(e) => setQuickModel((p) => ({ ...p, [groupId]: e.target.value }))}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  quickAddModel(c.id, groupId);
                                                }
                                              }}
                                              placeholder="＋ הוסף דגם רכב..."
                                              className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                            />
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={() => quickAddModel(c.id, groupId)}
                                              disabled={!quickModel[groupId]?.trim() || createModel.isPending}
                                            >
                                              הוסף
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                      <input
                                        value={entry.notes[groupId] ?? ""}
                                        onChange={(e) => setNote(c.id, groupId, e.target.value)}
                                        placeholder="הערה לתפעול"
                                        className="w-full px-3 py-1.5 bg-muted/40 border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                      />
                                    </div>
                                  );
                                })}
                              </>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    value={quickAdd[c.id] ?? ""}
                                    onChange={(e) => setQuickAdd((p) => ({ ...p, [c.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        quickAddGroup(c.id);
                                      }
                                    }}
                                    placeholder="＋ הוסף תת-קטגוריה..."
                                    className="flex-1 min-w-0 px-3 py-1.5 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => quickAddGroup(c.id)}
                                    disabled={!quickAdd[c.id]?.trim() || createGroup.isPending}
                                  >
                                    הוסף
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">אחראי:</span>
                                  <SearchableSelect
                                    value={entry.owners["_"] || resolveOwnerRole(null, c)}
                                    onChange={(v) => setOwner(c.id, "_", v)}
                                    options={OWNER_ROLE_OPTIONS}
                                  />
                                </div>

                                <input
                                  value={entry.notes["_"] ?? ""}
                                  onChange={(e) => setNote(c.id, "_", e.target.value)}
                                  placeholder="הערה לתפעול"
                                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
                                />
                              </div>
                            )}
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
      <EmployeeSetupWizard
        open={newEmployeeOpen}
        onOpenChange={setNewEmployeeOpen}
        onCreated={(employee) => {
          setEmployeeId(employee.id);
          setNewEmployeeOpen(false);
        }}
      />
    </>
  );
}
