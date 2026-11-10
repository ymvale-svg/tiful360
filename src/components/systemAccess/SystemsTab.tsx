import { useMemo, useState } from "react";
import { Check, DatabaseZap, Pencil, Plus, Server, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { IconButton } from "@/components/feedback/IconButton";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import {
  useAccessResources,
  useAccessSystems,
  useAddAccessResource,
  useDeleteAccessResource,
  useDeleteAccessSystem,
  useLegacyAccessImport,
  useRenameAccessResource,
  useSaveAccessSystem,
  useSetAccessResourceActive,
} from "@/hooks/useSystemAccess";
import { OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import type { LegacyImportResult } from "@/services/systemAccess";
import {
  PROVISIONING_LABEL,
  SUGGESTED_SYSTEMS,
  type AccessResource,
  type AccessSystem,
  type Provisioning,
} from "@/domain/systemAccess/types";

const OWNER_ROLES = ["admin", "it_manager", "operations", "hr", "finance"] as const;
const PROVISIONINGS = Object.keys(PROVISIONING_LABEL) as Provisioning[];
const inputClass = "w-full min-h-10 px-3 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Systems of the organisation, who executes each, and its environments in free text. */
export function SystemsTab() {
  const { toast } = useToast();
  const { data: systems = [], isLoading, error, refetch } = useAccessSystems();
  const save = useSaveAccessSystem();
  const remove = useDeleteAccessSystem();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", provisioning: "manual" as Provisioning, owner_role: "admin", resource_label: "סביבה" });

  const selected = systems.find((s) => s.id === selectedId) ?? systems[0] ?? null;
  const suggestions = useMemo(
    () => SUGGESTED_SYSTEMS.filter((s) => !systems.some((x) => x.name === s.name)),
    [systems],
  );

  const add = async (system: Pick<AccessSystem, "name" | "provisioning" | "owner_role" | "resource_label">) => {
    if (!system.name.trim()) return;
    try {
      const created = await save.mutateAsync({ ...system, sort_order: systems.length });
      setSelectedId(created.id);
      setDraft({ name: "", provisioning: "manual", owner_role: "admin", resource_label: "סביבה" });
    } catch (e) {
      toast({ title: "המערכת לא נוספה", description: message(e), variant: "destructive" });
    }
  };

  const update = async (system: AccessSystem, patch: Partial<AccessSystem>) => {
    try {
      await save.mutateAsync({ id: system.id, name: system.name, ...patch });
    } catch (e) {
      toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" });
    }
  };

  const askDelete = (system: AccessSystem) =>
    confirm({
      title: `למחוק את ${system.name}?`,
      description: `יימחקו גם כל ה${system.resource_label} וקבוצות הגישה שלה. אם יש לעובדים הרשאה במערכת, המחיקה לא תתבצע ואפשר להשבית אותה במקום.`,
      confirmLabel: "מחק",
      destructive: true,
      onConfirm: async () => {
        await remove.mutateAsync(system.id);
        if (selectedId === system.id) setSelectedId(null);
        toast({ title: "המערכת נמחקה" });
      },
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="systems-title" className="space-y-4">
        <h2 id="systems-title" className="text-base font-semibold">מערכות</h2>
        <StateView
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          isEmpty={systems.length === 0}
          label="מערכות"
          empty={{ title: "עוד אין מערכות", description: "הוסיפו את המערכות שעובדים מקבלים אליהן הרשאה.", icon: <Server className="w-6 h-6" /> }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th scope="col" className="text-start font-medium py-2 px-2">מערכת</th>
                  <th scope="col" className="text-start font-medium py-2 px-2">פתיחה</th>
                  <th scope="col" className="text-start font-medium py-2 px-2">אחראי</th>
                  <th scope="col" className="text-start font-medium py-2 px-2">פעילה</th>
                  <th scope="col" className="py-2 px-2"><span className="sr-only">מחיקה</span></th>
                </tr>
              </thead>
              <tbody>
                {systems.map((s) => (
                  <tr key={s.id} className={`border-b border-border/60 ${selected?.id === s.id ? "bg-primary/5" : ""}`}>
                    <th scope="row" className="text-start font-medium py-2 px-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        aria-pressed={selected?.id === s.id}
                        className="min-h-9 text-start hover:underline"
                      >
                        {s.name}
                      </button>
                      <div className="text-xs font-normal text-muted-foreground">{s.resource_label}</div>
                    </th>
                    <td className="py-2 px-2">
                      <select
                        value={s.provisioning}
                        onChange={(e) => { void update(s, { provisioning: e.target.value as Provisioning }); }}
                        aria-label={`אופן פתיחה ב${s.name}`}
                        className="min-h-9 px-2 bg-card border border-border rounded-lg text-sm"
                      >
                        {PROVISIONINGS.map((p) => <option key={p} value={p}>{PROVISIONING_LABEL[p]}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <select
                        value={s.owner_role}
                        onChange={(e) => { void update(s, { owner_role: e.target.value }); }}
                        aria-label={`אחראי על ${s.name}`}
                        className="min-h-9 px-2 bg-card border border-border rounded-lg text-sm"
                      >
                        {OWNER_ROLES.map((r) => <option key={r} value={r}>{OWNER_ROLE_LABEL[r] ?? r}</option>)}
                      </select>
                    </td>
                    <td className="py-2 px-2">
                      <Switch
                        checked={s.is_active}
                        onCheckedChange={(v) => { void update(s, { is_active: v }); }}
                        aria-label={`${s.name} פעילה`}
                      />
                    </td>
                    <td className="py-2 px-2">
                      <IconButton label={`מחק את ${s.name}`} onClick={() => { void askDelete(s); }}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StateView>

        <form
          className="rounded-xl border border-dashed border-border p-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); void add(draft); }}
          aria-labelledby="add-system-title"
        >
          <h3 id="add-system-title" className="text-sm font-semibold">הוספת מערכת</h3>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="מערכות מוצעות">
              {suggestions.map((s) => (
                <Button key={s.name} type="button" size="sm" variant="outline" onClick={() => { void add(s); }} disabled={save.isPending}>
                  <Plus className="w-3.5 h-3.5" /> {s.name}
                </Button>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="שם המערכת" required>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} />
            </FormField>
            <FormField label="איך קוראים לחלקים בה" hint="סביבה, פרויקט, תיקייה…">
              <input value={draft.resource_label} onChange={(e) => setDraft({ ...draft, resource_label: e.target.value })} className={inputClass} />
            </FormField>
            <FormField label="אופן פתיחה">
              <select value={draft.provisioning} onChange={(e) => setDraft({ ...draft, provisioning: e.target.value as Provisioning })} className={inputClass}>
                {PROVISIONINGS.map((p) => <option key={p} value={p}>{PROVISIONING_LABEL[p]}</option>)}
              </select>
            </FormField>
            <FormField label="אחראי ביצוע">
              <select value={draft.owner_role} onChange={(e) => setDraft({ ...draft, owner_role: e.target.value })} className={inputClass}>
                {OWNER_ROLES.map((r) => <option key={r} value={r}>{OWNER_ROLE_LABEL[r] ?? r}</option>)}
              </select>
            </FormField>
          </div>
          <Button type="submit" size="sm" disabled={!draft.name.trim()} loading={save.isPending} loadingText="מוסיף…">
            <Plus className="w-4 h-4" /> הוסף מערכת
          </Button>
        </form>

        <LegacyImportCard />
      </section>

      {selected && <EnvironmentsPanel system={selected} />}
    </div>
  );
}

/** The selected system's environments (or projects), added and switched off in free text. */
function EnvironmentsPanel({ system }: { system: AccessSystem }) {
  const { toast } = useToast();
  const { data: resources = [], isLoading, error, refetch } = useAccessResources(system.id);
  const add = useAddAccessResource(system.id);
  const setActive = useSetAccessResourceActive(system.id);
  const rename = useRenameAccessResource(system.id);
  const removeResource = useDeleteAccessResource(system.id);
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const topLevel = resources.filter((r) => !r.parent_id);
  const hasChildren = useMemo(() => new Set(resources.map((r) => r.parent_id).filter(Boolean)), [resources]);

  const askDeleteResource = (r: AccessResource) =>
    confirm({
      title: `למחוק את ${r.name}?`,
      description: hasChildren.has(r.id)
        ? "יימחקו גם כל התיקיות שבתוכה. אם יש לעובדים הרשאה כאן, המחיקה לא תתבצע ואפשר להשבית במקום."
        : "אם יש לעובדים הרשאה כאן, המחיקה לא תתבצע ואפשר להשבית במקום.",
      confirmLabel: "מחק",
      destructive: true,
      onConfirm: async () => {
        await removeResource.mutateAsync(r.id);
        toast({ title: "נמחק" });
      },
    });

  const startEdit = (r: AccessResource) => { setEditingId(r.id); setEditName(r.name); };
  const cancelEdit = () => { setEditingId(null); setEditName(""); };
  const saveEdit = async (r: AccessResource) => {
    const clean = editName.trim();
    if (!clean || clean === r.name) { cancelEdit(); return; }
    try {
      await rename.mutateAsync({ resource: r, name: clean });
      cancelEdit();
      toast({ title: "השם עודכן" });
    } catch (e) {
      toast({ title: "השם לא נשמר", description: message(e), variant: "destructive" });
    }
  };

  const submit = async () => {
    const clean = name.trim();
    if (!clean) return;
    try {
      await add.mutateAsync({ name: clean });
      setName("");
    } catch (e) {
      toast({ title: "לא נוסף", description: message(e), variant: "destructive" });
    }
  };

  return (
    <section aria-labelledby="env-title" className="rounded-xl border border-border p-4 space-y-3 self-start">
      <div>
        <h2 id="env-title" className="text-base font-semibold">{system.name}: {system.resource_label}</h2>
        <p className="text-xs text-muted-foreground">
          {resources.length > topLevel.length
            ? "עץ מלא מנוהל בלשונית עץ וקבוצות. כאן מופיעה הרמה העליונה."
            : "שדות חופשיים. מה שמושבת לא מוצע בבקשות חדשות, והרשאות קיימות נשמרות."}
        </p>
      </div>
      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={topLevel.length === 0}
        label={system.resource_label}
        empty={{ title: `אין עדיין ${system.resource_label}`, description: "הוסיפו את הראשונה למטה." }}
      >
        <ul className="divide-y divide-border/60">
          {topLevel.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              {editingId === r.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => { e.preventDefault(); void saveEdit(r); }}
                >
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                    aria-label={`שם חדש ל${r.name}`}
                    className={inputClass}
                  />
                  <IconButton type="submit" label="שמור שם" disabled={!editName.trim()} loading={rename.isPending}>
                    <Check className="w-4 h-4" />
                  </IconButton>
                  <IconButton type="button" label="ביטול עריכה" onClick={cancelEdit}>
                    <X className="w-4 h-4" />
                  </IconButton>
                </form>
              ) : (
                <div className="flex flex-1 items-center gap-1 min-w-0">
                  <span className={r.is_active ? "" : "text-muted-foreground line-through"}>
                    {r.name}
                    {r.missing_since && <span className="ms-2 text-xs text-warning">לא נמצא בייבוא האחרון</span>}
                  </span>
                  {!hasChildren.has(r.id) && (
                    <IconButton label={`ערוך את ${r.name}`} onClick={() => startEdit(r)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </IconButton>
                  )}
                  <IconButton label={`מחק את ${r.name}`} onClick={() => { void askDeleteResource(r); }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </IconButton>
                </div>
              )}
              <Switch
                checked={r.is_active}
                onCheckedChange={(v) =>
                  setActive.mutate(
                    { resourceId: r.id, isActive: v },
                    { onError: (e) => toast({ title: "השינוי לא נשמר", description: message(e), variant: "destructive" }) },
                  )
                }
                aria-label={`${r.name} פעיל`}
              />
            </li>
          ))}
        </ul>
      </StateView>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${system.resource_label} חדשה`}
          aria-label={`${system.resource_label} חדשה ב${system.name}`}
          className={inputClass}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!name.trim()} loading={add.isPending} loadingText="מוסיף…">
          הוסף
        </Button>
      </form>
    </section>
  );
}

/** One-time import of access that employees already hold: digital-access assets and the old list.
 *  Shows what would be created first; running it again adds only what is new. */
function LegacyImportCard() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { preview, apply } = useLegacyAccessImport();

  const start = async () => {
    let result: LegacyImportResult;
    try {
      result = await preview.mutateAsync();
    } catch (e) {
      toast({ title: "לא ניתן לבדוק", description: message(e), variant: "destructive" });
      return;
    }
    if (result.grants === 0) {
      toast({ title: "אין מה לייבא", description: result.skipped ? `${result.skipped} הרשאות כבר קיימות במסך.` : "לא נמצאו גישות דיגיטליות משויכות לעובדים." });
      return;
    }
    await confirm({
      title: "ייבוא הרשאות קיימות",
      description: (
        <div className="space-y-2 text-sm">
          <p>{result.grants} הרשאות פעילות ל-{result.employees} עובדים{result.skipped ? ` · ${result.skipped} כבר קיימות ולא ייובאו שוב` : ""}.</p>
          {(result.systemsCreated > 0 || result.resourcesCreated > 0) && (
            <p>יתווספו {result.systemsCreated} מערכות ו-{result.resourcesCreated} סביבות שעוד לא מוגדרות.</p>
          )}
          <table className="w-full text-xs" aria-label="הרשאות לייבוא לפי מערכת">
            <thead>
              <tr className="text-muted-foreground"><th scope="col" className="text-start font-medium">מערכת</th><th scope="col" className="text-start font-medium">הרשאות</th></tr>
            </thead>
            <tbody>
              {Object.entries(result.bySystem).map(([name, v]) => (
                <tr key={name}><th scope="row" className="text-start font-normal">{name}</th><td>{v.grants}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted-foreground">תאריך התחילה הוא היום הראשון של העובד ב-08:00. מועד הפתיחה בפועל לא ידוע ויוצג בפרוטוקול כ"—". לא נפתחות קריאות.</p>
        </div>
      ),
      confirmLabel: "ייבא",
      onConfirm: async () => {
        const done = await apply.mutateAsync();
        toast({ title: "ההרשאות יובאו", description: `${done.grants} הרשאות ל-${done.employees} עובדים` });
      },
    });
  };

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      <h3 className="text-sm font-semibold">הרשאות שכבר קיימות</h3>
      <p className="text-xs text-muted-foreground">
        גישות דיגיטליות שמשויכות לעובדים במשאבים יובאו כהרשאות פעילות, כדי שהמטריצה, ההצעות וההתראות יראו את התמונה המלאה. אפשר להריץ שוב: רק מה שחדש יתווסף.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={() => { void start(); }} loading={preview.isPending} loadingText="בודק…">
        <DatabaseZap className="w-4 h-4" /> בדוק מה ייובא
      </Button>
    </div>
  );
}
