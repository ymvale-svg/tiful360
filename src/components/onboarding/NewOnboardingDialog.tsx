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
  type OnboardingProcess,
} from "@/hooks/useOnboarding";
import { appendOnboardingAudit } from "@/hooks/useOnboardingProtocol";
import { useQueryClient } from "@tanstack/react-query";
import { groupByTrack, itemTypeForCategory, showInOnboarding, TRACK_HINT, TRACK_LABEL } from "@/domain/onboarding/tracks";
import { useAuth } from "@/hooks/useAuth";
import { useAccessSystems, useHeldGrants } from "@/hooks/useSystemAccess";
import { PEER_BASIS_LABEL, peersOf, suggestAccess, suggestEquipment } from "@/domain/suggestions/peers";
import { AccessPicker } from "@/components/systemAccess/AccessPicker";
import { defaultEffectiveLocal, itemsToPicks, picksToItems, type PickState } from "@/domain/systemAccess/picks";
import { resolveOwnerRole, OWNER_ROLE_OPTIONS, OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import { Send, Copy, UserPlus, CalendarDays, AlertCircle, X, Sparkles } from "lucide-react";
import { EmployeeSetupWizard } from "@/components/EmployeeSetupWizard";
import { SendToOpsDialog } from "@/components/onboarding/SendToOpsDialog";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog edits this existing process instead of creating a new one. */
  editProcess?: OnboardingProcess | null;
}

type SelectedEntry = {
  groupIds: string[];
  notes: Record<string, string>;
  owners: Record<string, string>;
  /** groupId -> chosen model id (vehicle models etc.) */
  models: Record<string, string>;
};

export function NewOnboardingDialog({ open, onOpenChange, editProcess }: Props) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const { data: assets = [], isLoading: assetsLoading } = useAssets();
  const { data: templates = [] } = useRoleTemplates();
  const { data: groupModels = [] } = useAssetGroupModels();
  const createGroup = useCreateAssetGroup();
  const createModel = useCreateAssetGroupModel();
  const create = useCreateOnboardingProcess();
  const qc = useQueryClient();
  const { hasRole } = useAuth();
  // Who handles an item, and what the catalog holds, are set by the people who run it; HR
  // only chooses what the employee needs.
  const canManageCatalog = hasRole("admin") || hasRole("operations") || hasRole("it_manager");

  const { data: accessSystems = [] } = useAccessSystems();
  // With systems defined in the access catalog, access is picked there instead of from asset categories.
  const useAccessCatalog = accessSystems.some((s) => s.is_active);
  const [accessPicks, setAccessPicks] = useState<PickState>({});
  const { data: heldGrants = [], isLoading: heldGrantsLoading } = useHeldGrants();

  const [employeeId, setEmployeeId] = useState("");
  const [selected, setSelected] = useState<Record<string, SelectedEntry>>({});
  const [copyFromId, setCopyFromId] = useState("");
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  const [quickAdd, setQuickAdd] = useState<Record<string, string>>({});
  const [quickModel, setQuickModel] = useState<Record<string, string>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingSend, setPendingSend] = useState<
    { processId: string; employeeId: string; count: number } | null
  >(null);


  useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setSelected({});
      setAccessPicks({});
      setCopyFromId("");
      setQuickAdd({});
      setQuickModel({});
      return;
    }
    // Edit mode: prefill the selection from the process's existing items.
    if (editProcess) {
      setEmployeeId(editProcess.employee_id);
      const next: Record<string, SelectedEntry> = {};
      (editProcess.onboarding_items ?? []).forEach((i) => {
        if (!i.catalog_ref_id) return;
        const entry = next[i.catalog_ref_id] ?? { groupIds: [], notes: {}, owners: {}, models: {} };
        const gk = i.selected_group_id ?? "_";
        if (i.selected_group_id && !entry.groupIds.includes(i.selected_group_id)) {
          entry.groupIds.push(i.selected_group_id);
        }
        entry.owners[gk] = i.owner_role ?? "";
        if (i.notes) entry.notes[gk] = i.notes;
        if (i.selected_group_id && i.selected_model_id) entry.models[i.selected_group_id] = i.selected_model_id;
        next[i.catalog_ref_id] = entry;
      });
      setSelected(next);
      setAccessPicks(itemsToPicks(editProcess.access_picks, defaultEffectiveLocal(editProcess.employees?.start_date)));
    }
  }, [open, editProcess]);

  const employee = employees.find((e: any) => e.id === employeeId);

  // Pre-load from a matching role template when picking the employee.
  useEffect(() => {
    if (editProcess) return; // edit mode keeps the process's own items
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

  // Only categories meant for onboarding, grouped by how they are fulfilled.
  const blocks = useMemo(
    () =>
      groupByTrack(categories as any[])
        .filter(({ track }) => !(useAccessCatalog && track === "access"))
        .map(({ track, categories: cats }) => ({
          title: TRACK_LABEL[track],
          hint: TRACK_HINT[track],
          cats,
        })),
    [categories, useAccessCatalog]
  );
  const accessFrom = defaultEffectiveLocal((employee as { start_date?: string | null } | undefined)?.start_date);
  const accessItems = picksToItems(accessPicks, accessFrom);
  // Access already sent with the process is handled in the system access screen, not edited here.
  const accessLocked = !!editProcess && editProcess.status !== "draft";

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
      const sourceCat = (categories as any[]).find((c) => c.id === catId);
      if (!showInOnboarding(sourceCat)) return;
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

  // What employees in the same role (and department) hold today, merged into the selection.
  const suggestFromPeers = () => {
    if (!employee) return;
    const group = peersOf(employee, employees);
    if (!group) {
      toast({ title: "אין מספיק עובדים דומים", description: "צריך לפחות שני עובדים פעילים באותו תפקיד או באותה מחלקה." });
      return;
    }
    const visible = new Set(blocks.flatMap((b) => b.cats.map((c: { id: string }) => c.id)));
    const equipment = suggestEquipment(group.peerIds, assets).filter((s) => visible.has(s.key.category_id));
    const next: Record<string, SelectedEntry> = { ...selected };
    let addedItems = 0;
    for (const { key } of equipment) {
      const entry = next[key.category_id] ?? { groupIds: [], notes: {}, owners: {}, models: {} };
      const cat = categories.find((c) => c.id === key.category_id);
      if (key.group_id && !entry.groupIds.includes(key.group_id)) {
        entry.groupIds = [...entry.groupIds, key.group_id];
        entry.owners = { ...entry.owners, [key.group_id]: resolveOwnerRole(groups.find((g) => g.id === key.group_id), cat) };
        addedItems++;
      } else if (!next[key.category_id]) {
        addedItems++;
      }
      next[key.category_id] = entry;
    }
    setSelected(next);

    let addedAccess = 0;
    if (useAccessCatalog) {
      const activeSystems = new Set(accessSystems.filter((s) => s.is_active).map((s) => s.id));
      const picks: PickState = { ...accessPicks };
      for (const { key } of suggestAccess(group.peerIds, heldGrants)) {
        if (!activeSystems.has(key.system_id)) continue;
        const entry = picks[key.system_id] ?? { groupIds: [], resourceIds: [], effectiveFrom: accessFrom };
        if (key.group_id && !entry.groupIds.includes(key.group_id)) entry.groupIds = [...entry.groupIds, key.group_id];
        else if (key.resource_id && !entry.resourceIds.includes(key.resource_id)) entry.resourceIds = [...entry.resourceIds, key.resource_id];
        else if (picks[key.system_id]) continue;
        picks[key.system_id] = entry;
        addedAccess++;
      }
      setAccessPicks(picks);
    }
    toast({
      title: addedItems + addedAccess ? "נוספה הצעה לפי עובדים דומים" : "לא נמצא מה להוסיף",
      description: `${addedItems} פריטים ו-${addedAccess} הרשאות שמחזיקים לפחות חצי מ-${group.peerIds.length} העובדים ${PEER_BASIS_LABEL[group.basis]}. אפשר להסיר כל אחד.`,
    });
  };

  const buildItems = (): NewOnboardingItem[] =>
    Object.entries(selected).flatMap(([categoryId, entry]) => {
      const cat = (categories as any[]).find((c) => c.id === categoryId);
      const itemType = itemTypeForCategory(cat);
      if (entry.groupIds.length === 0) {
        return [
          {
            title: cat?.category_name ?? "פריט",
            owner_role: entry.owners["_"] || resolveOwnerRole(null, cat),
            item_type: itemType,
            catalog_ref_id: categoryId,
            selected_group_id: null,
            notes: entry.notes["_"]?.trim() || null,
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
          item_type: itemType,
          catalog_ref_id: categoryId,
          selected_group_id: groupId,
          selected_model_id: modelId,
          notes: entry.notes[groupId]?.trim() || null,
        };
      });
    });


  // Edit mode: apply the selection diff to the existing process.
  // Items already done or with an assigned asset are never deleted; manual items
  // (without a catalog reference) are kept as-is.
  const saveEdit = async () => {
    // One save at a time: a second click would insert the same new items twice.
    if (!editProcess || savingEdit) return;
    const newItems = buildItems();
    const key = (i: { catalog_ref_id?: string | null; selected_group_id?: string | null; selected_model_id?: string | null }) =>
      `${i.catalog_ref_id ?? ""}|${i.selected_group_id ?? "_"}|${i.selected_model_id ?? ""}`;
    const existing = editProcess.onboarding_items ?? [];
    const newKeys = new Set(newItems.map(key));
    const existingByKey = new Map(existing.map((i) => [key(i), i]));

    const toDelete = existing.filter(
      (i) => i.status !== "done" && !i.asset_id && i.catalog_ref_id && !newKeys.has(key(i))
    );
    const toInsert = newItems.filter((i) => !existingByKey.has(key(i)));
    const toUpdate = newItems
      .filter((i) => existingByKey.has(key(i)))
      .map((i) => ({ id: existingByKey.get(key(i))!.id, item: i }))
      .filter(({ id, item }) => {
        const ex = existingByKey.get(key(item))!;
        return ex.owner_role !== item.owner_role || (ex.notes ?? null) !== (item.notes ?? null) || ex.title !== item.title;
      });

    setSavingEdit(true);
    try {
      for (const d of toDelete) {
        const { error } = await supabase.from("onboarding_items").delete().eq("id", d.id);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase
          .from("onboarding_items")
          .update({ title: u.item.title, owner_role: u.item.owner_role, notes: u.item.notes ?? null } as any)
          .eq("id", u.id);
        if (error) throw error;
      }
      if (toInsert.length) {
        const { error } = await supabase.from("onboarding_items").insert(
          toInsert.map((i) => ({
            process_id: editProcess.id,
            title: i.title,
            item_type: i.item_type ?? "asset",
            owner_role: i.owner_role ?? "it_manager",
            catalog_ref_id: i.catalog_ref_id ?? null,
            selected_group_id: i.selected_group_id ?? null,
            selected_model_id: i.selected_model_id ?? null,
            fulfillment_type: i.fulfillment_type ?? null,
            notes: i.notes ?? null,
            status: "pending",
          })) as any
        );
        if (error) throw error;
      }
      const accessChanged =
        !accessLocked && JSON.stringify(accessItems) !== JSON.stringify(editProcess.access_picks ?? []);
      if (accessChanged) {
        const { error } = await supabase
          .from("onboarding_processes")
          .update({ access_picks: accessItems.length ? (accessItems as unknown as Json) : null })
          .eq("id", editProcess.id);
        if (error) throw error;
      }
      const changes: string[] = [];
      if (accessChanged) changes.push("הרשאות למערכות עודכנו");
      if (toInsert.length) changes.push(`${toInsert.length} נוספו`);
      if (toUpdate.length) changes.push(`${toUpdate.length} עודכנו`);
      if (toDelete.length) changes.push(`${toDelete.length} הוסרו`);
      await appendOnboardingAudit(
        editProcess.id,
        `התהליך נערך מחלון הקליטה${changes.length ? `: ${changes.join(", ")}` : " — ללא שינויים"}`
      );
      qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
      qc.invalidateQueries({ queryKey: ["employee-onboarding-process"] });
      toast({ title: "השינויים נשמרו", description: changes.length ? changes.join(" · ") : "לא בוצעו שינויים" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה בשמירה", description: e.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const submit = async (status: "draft" | "sent") => {
    if (!employeeId) {
      toast({ title: "בחר עובד", variant: "destructive" });
      return;
    }
    const items = buildItems();
    if (!items.length && !accessItems.length) {
      toast({ title: "בחר לפחות פריט אחד", variant: "destructive" });
      return;
    }
    try {
      // The process is always created as a draft; sending to operations happens
      // in the protocol dialog (signature → PDF → ticket → email).
      const proc = await create.mutateAsync({ employee_id: employeeId, items, status: "draft", access_picks: accessItems });
      if (status === "sent" && proc?.id) {
        setPendingSend({ processId: proc.id, employeeId, count: items.length + accessItems.length });
        onOpenChange(false);
        return;
      }
      toast({ title: "נשמר כטיוטה", description: `${items.length} פריטים בתהליך הקליטה` });
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
      <Dialog open={open} onOpenChange={(o) => { if (!o && (savingEdit || create.isPending)) return; onOpenChange(o); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {editProcess ? "עריכת תהליך קליטה" : "תהליך קליטת עובד"}
            </DialogTitle>
            <DialogDescription>
              {editProcess
                ? `עריכת הצרכים של ${editProcess.employees?.full_name ?? "העובד"} — פריטים שכבר בוצעו נשמרים ולא יימחקו`
                : "בחר את העובד ואת המשאבים הנדרשים לו ליום הראשון"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div>
                <label htmlFor="onboarding-employee" className="text-sm font-medium mb-1.5 block">עובד נקלט</label>
                <div className="flex gap-2">
                  <div className={`flex-1 ${editProcess ? "pointer-events-none opacity-60" : ""}`}>
                    <SearchableSelect id="onboarding-employee" value={employeeId} onChange={setEmployeeId} options={employeeOptions} disabled={!!editProcess} />
                  </div>
                  {!editProcess && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="עובד חדש"
                      aria-label="הקמת עובד חדש"
                      onClick={() => setNewEmployeeOpen(true)}
                    >
                      <UserPlus className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
                {employee && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
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
                          if (d < 0) return <span className="text-destructive-text">החל לפני {Math.abs(d)} ימים</span>;
                          if (d === 0) return <span className="text-warning-text">היום</span>;
                          return <span className="text-success-text">בעוד {d} ימים</span>;
                        })()}
                      </span>
                    )}
                  </div>
                )}
                {employee && !(employee as any).start_date && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-destructive-text">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    חסר תאריך תחילת עבודה בכרטיס העובד — יש לעדכן את הכרטיס לפני השליחה לתפעול.
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="onboarding-copy-from" className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" /> העתק צרכים מעובד קיים
                </label>
                <SearchableSelect
                  id="onboarding-copy-from"
                  value={copyFromId}
                  onChange={copyFromEmployee}
                  options={(employees as any[]).map((e) => ({ value: e.id, label: e.full_name }))}
                  placeholder="בחר עובד להעתקה..."
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1.5"
                  onClick={suggestFromPeers}
                  // The suggestion reads current holdings; until they load it would report "לא נמצא מה להוסיף".
                  disabled={!employee || assetsLoading || (useAccessCatalog && heldGrantsLoading)}
                  title="מוסיף ציוד והרשאות שמחזיקים רוב העובדים באותו תפקיד ומחלקה"
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" /> הצע לי סט לפי עובדים דומים
                </Button>
              </div>
            </div>

            {useAccessCatalog && (
              <div className="border border-border/60 rounded-xl p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold">הרשאות למערכות</h3>
                  <span className="text-xs text-muted-foreground">נשלח למנהל ההרשאות עם הבקשה</span>
                </div>
                {accessLocked ? (
                  <p className="text-sm text-muted-foreground">
                    ההרשאות נשלחו עם הבקשה ומטופלות במסך הרשאות מערכות. שינוי או תוספת: בקשת הרשאות חדשה משם.
                  </p>
                ) : (
                  <AccessPicker value={accessPicks} onChange={setAccessPicks} defaultFrom={accessFrom} />
                )}
              </div>
            )}

            {blocks.map((block) => (
              <div key={block.title} className="border border-border/60 rounded-xl p-4">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="text-sm font-semibold">{block.title}</h3>
                  <span className="text-xs text-muted-foreground">{block.hint}</span>
                </div>
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
                                        aria-pressed={checked}
                                        className={`
                                          inline-flex items-center gap-1 min-h-9 px-3 py-1 rounded-full text-xs border transition-colors
                                          ${checked
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background text-foreground border-border hover:bg-muted"}
                                        `}
                                      >
                                        {checked && <X className="w-3 h-3" aria-hidden="true" />}
                                        {g.name}
                                      </button>
                                    );
                                  })}
                                </div>
                                {canManageCatalog && <div className="flex items-center gap-2">
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
                                    aria-label={`תת-קטגוריה חדשה ל${c.category_name}`}
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
                                </div>}
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
                                        {canManageCatalog ? (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">אחראי:</span>
                                            <SearchableSelect
                                              value={entry.owners[groupId] || resolveOwnerRole(group, c)}
                                              onChange={(v) => setOwner(c.id, groupId, v)}
                                              options={OWNER_ROLE_OPTIONS}
                                            />
                                          </div>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">
                                            יטופל ע"י: {OWNER_ROLE_LABEL[entry.owners[groupId] || resolveOwnerRole(group, c)] ?? "תפעול"}
                                          </span>
                                        )}
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
                                          {canManageCatalog && <div className="flex items-center gap-2">
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
                                          </div>}
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
                                {canManageCatalog && <div className="flex items-center gap-2">
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
                                </div>}
                                {canManageCatalog ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">אחראי:</span>
                                    <SearchableSelect
                                      value={entry.owners["_"] || resolveOwnerRole(null, c)}
                                      onChange={(v) => setOwner(c.id, "_", v)}
                                      options={OWNER_ROLE_OPTIONS}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    יטופל ע"י: {OWNER_ROLE_LABEL[entry.owners["_"] || resolveOwnerRole(null, c)] ?? "תפעול"}
                                  </p>
                                )}

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
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={savingEdit || create.isPending}>ביטול</Button>
            {editProcess ? (
              <Button onClick={() => { void saveEdit(); }} loading={savingEdit} loadingText="שומר שינויים…" className="gap-2">
                שמור שינויים
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => { void submit("draft"); }} disabled={create.isPending}>
                  שמור כטיוטה
                </Button>
                <Button onClick={() => { void submit("sent"); }} loading={create.isPending} loadingText="שומר…" className="gap-2">
                  <Send className="w-4 h-4" />
                  שלח לתפעול
                </Button>
              </>
            )}
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
      <SendToOpsDialog
        open={!!pendingSend}
        onOpenChange={(o) => !o && setPendingSend(null)}
        processId={pendingSend?.processId ?? null}
        employeeId={pendingSend?.employeeId ?? null}
        employeeName={employees.find((e: any) => e.id === pendingSend?.employeeId)?.full_name}
        itemCount={pendingSend?.count}
        onSent={() => setPendingSend(null)}
      />
    </>
  );
}
