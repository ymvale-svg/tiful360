import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, Copy, FolderTree, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDrop } from "@/components/feedback/FileDrop";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { TreeScanPanel } from "@/components/systemAccess/TreeScanPanel";
import { useToast } from "@/hooks/use-toast";
import {
  useAccessGroups,
  useAccessResources,
  useAccessSystems,
  useImportAccessTree,
  useSaveAccessGroup,
  useSetGroupResource,
} from "@/hooks/useSystemAccess";
import { buildTree, visibleNodes } from "@/domain/systemAccess/tree";
import { diffTree, parseTreeExport, treeExportCommand } from "@/domain/systemAccess/treeImport";
import { LEVEL_LABEL, type AccessLevel } from "@/domain/systemAccess/protocol";
import type { AccessGroup, AccessSystem } from "@/domain/systemAccess/types";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inputClass = "w-full min-h-10 px-3 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";

/** A system's resource tree, its access groups, and which folders each group opens. */
export function AccessTreeTab() {
  const { data: systems = [], isLoading, error, refetch } = useAccessSystems();
  const active = systems.filter((s) => s.is_active);
  const [systemId, setSystemId] = useState<string | null>(null);
  const system = active.find((s) => s.id === systemId) ?? active[0] ?? null;

  return (
    <StateView
      loading={isLoading}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={active.length === 0}
      label="מערכות"
      empty={{ title: "עוד אין מערכות", description: "הוסיפו מערכת בלשונית מערכות וסביבות.", icon: <FolderTree className="w-6 h-6" /> }}
    >
      <div className="flex flex-wrap gap-4">
        <nav aria-label="מערכות" className="flex lg:flex-col gap-1 flex-wrap lg:w-44">
          {active.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSystemId(s.id)}
              aria-pressed={system?.id === s.id}
              className={`min-h-10 px-3 rounded-lg text-sm text-start ${system?.id === s.id ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
            >
              {s.name}
            </button>
          ))}
        </nav>
        {system && <SystemTree key={system.id} system={system} />}
      </div>
    </StateView>
  );
}

function SystemTree({ system }: { system: AccessSystem }) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { data: resources = [], isLoading, error, refetch } = useAccessResources(system.id);
  const { data: groups = [] } = useAccessGroups(system.id);
  const importTree = useImportAccessTree(system.id);
  const setGroupResource = useSetGroupResource(system.id);
  const saveGroup = useSaveAccessGroup(system.id);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [groupId, setGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", external_name: "" });
  const [root, setRoot] = useState("P:\\");
  const [query, setQuery] = useState("");

  const selectedGroup = groups.find((g) => g.id === groupId) ?? null;
  const tree = useMemo(() => buildTree(resources), [resources]);
  const groupsByResource = useMemo(() => {
    const map = new Map<string, Array<{ group: AccessGroup; level: AccessLevel }>>();
    for (const g of groups) {
      for (const link of g.system_access_group_resources) {
        map.set(link.resource_id, [...(map.get(link.resource_id) ?? []), { group: g, level: link.level }]);
      }
    }
    return map;
  }, [groups]);

  const q = query.trim();
  const rows = q
    ? resources.filter((r) => r.path.includes(q)).map((row) => ({ row, depth: 0, children: [] }))
    : visibleNodes(tree, expanded);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const parsed = parseTreeExport(await file.text());
    if (parsed.paths.length === 0) {
      toast({ title: "לא נמצאו תיקיות בקובץ", description: "ודאו שזה הקובץ שהפקודה יצרה.", variant: "destructive" });
      return;
    }
    const diff = diffTree(resources.map((r) => r.path), parsed.paths);
    await confirm({
      title: `ייבוא עץ ל${system.name}`,
      description: (
        <div className="space-y-1 text-sm">
          <p>{parsed.paths.length} תיקיות בקובץ{parsed.root ? ` (מתחת ל-${parsed.root})` : ""}.</p>
          <p>{diff.added.length} חדשות יתווספו.</p>
          <p>{diff.missing.length} שכבר קיימות לא מופיעות בקובץ: הן יסומנו "לא נמצא", לא יימחקו, והשיוך שלהן לקבוצות נשמר.</p>
        </div>
      ),
      confirmLabel: "ייבא",
      onConfirm: async () => {
        const result = await importTree.mutateAsync(parsed.paths);
        toast({ title: "העץ יובא", description: `${result.added} חדשות · ${result.missing} לא נמצאו · ${result.returned} חזרו` });
      },
    });
  };

  const addGroup = async () => {
    if (!draft.name.trim()) return;
    try {
      await saveGroup.mutateAsync({ name: draft.name, external_name: draft.external_name });
      setDraft({ name: "", external_name: "" });
    } catch (e) {
      toast({ title: "הקבוצה לא נוספה", description: message(e), variant: "destructive" });
    }
  };

  const setLevel = (resourceId: string, level: AccessLevel | null) => {
    if (!selectedGroup) return;
    setGroupResource.mutate(
      { groupId: selectedGroup.id, resourceId, level },
      { onError: (e) => toast({ title: "השיוך לא נשמר", description: message(e), variant: "destructive" }) },
    );
  };

  const levelInSelected = (resourceId: string) =>
    selectedGroup?.system_access_group_resources.find((l) => l.resource_id === resourceId)?.level ?? null;

  return (
    <div className="flex-1 min-w-0 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="tree-title" className="rounded-xl border border-border p-4 space-y-3 min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="tree-title" className="text-base font-semibold">עץ {system.name}</h2>
            <p className="text-xs text-muted-foreground">
              {resources.length} {system.resource_label === "תיקייה" ? "תיקיות" : "פריטים"}
              {selectedGroup ? ` · עורכים את הקבוצה "${selectedGroup.name}"` : " · בחרו קבוצה כדי לשייך אליה"}
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש בעץ"
            aria-label={`חיפוש בעץ ${system.name}`}
            className="min-h-10 px-3 bg-card border border-border rounded-lg text-sm w-48"
          />
        </div>

        <StateView
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          isEmpty={resources.length === 0}
          label="עץ"
          empty={{ title: "העץ ריק", description: "ייבאו את עץ התיקיות מהקובץ שהפקודה למטה יוצרת." }}
        >
          <ul className="divide-y divide-border/50" aria-label={`עץ ${system.name}`}>
            {rows.map(({ row, depth, children }) => {
              const tags = groupsByResource.get(row.id) ?? [];
              const level = levelInSelected(row.id);
              return (
                <li
                  key={row.id}
                  className={`flex flex-wrap items-center gap-2 py-1.5 text-sm ${row.missing_since ? "bg-warning/5" : ""}`}
                  style={{ paddingInlineStart: `${depth * 20}px` }}
                >
                  {children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={expanded.has(row.id)}
                      aria-label={`${expanded.has(row.id) ? "סגור" : "פתח"} ${row.name}`}
                      className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted"
                    >
                      {expanded.has(row.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                    </button>
                  ) : (
                    <span className="w-8" aria-hidden="true" />
                  )}
                  <span className={row.is_active ? "font-medium" : "text-muted-foreground line-through"}>{q ? row.path : row.name}</span>
                  {row.missing_since && <span className="text-xs text-warning-text">לא נמצא בייבוא האחרון</span>}
                  <span className="flex-1" />
                  {tags.map(({ group, level: l }) => (
                    <span key={group.id} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {group.name}{l === "read" ? " · קריאה" : ""}
                    </span>
                  ))}
                  {selectedGroup && (
                    <select
                      value={level ?? ""}
                      onChange={(e) => setLevel(row.id, (e.target.value || null) as AccessLevel | null)}
                      aria-label={`${row.name} בקבוצה ${selectedGroup.name}`}
                      className="min-h-8 px-2 bg-card border border-border rounded-lg text-xs"
                    >
                      <option value="">לא בקבוצה</option>
                      <option value="write">{LEVEL_LABEL.write}</option>
                      <option value="read">{LEVEL_LABEL.read}</option>
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
          {q && rows.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground" role="status">
              אין תיקיות שמתאימות ל„{q}”.{" "}
              <button type="button" onClick={() => setQuery("")} className="font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">נקה חיפוש</button>
            </p>
          )}
        </StateView>

        <TreeScanPanel system={system} />

        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
          <h3 className="text-sm font-semibold">ייבוא עץ מהשרת</h3>
          <div className="flex flex-wrap items-end gap-2">
            <FormField label="כונן או שיתוף" className="w-40">
              <input value={root} onChange={(e) => setRoot(e.target.value)} className={inputClass} dir="ltr" />
            </FormField>
            <code dir="ltr" className="flex-1 min-w-0 text-xs bg-card border border-border rounded-lg p-2 break-all">
              {treeExportCommand(root)}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(treeExportCommand(root));
                toast({ title: "הפקודה הועתקה" });
              }}
            >
              <Copy className="w-4 h-4" /> העתק
            </Button>
          </div>
          <FileDrop
            accept=".csv,.txt,text/csv,text/plain"
            onFiles={(files) => { void onFiles(files); }}
            disabled={importTree.isPending}
            title="גררו לכאן את tree.csv או לחצו לבחירה"
            hint="ייבוא חוזר מוסיף תיקיות חדשות ומסמן שנמחקו, בלי למחוק שיוכים"
          />
        </div>
      </section>

      <section aria-labelledby="groups-title" className="rounded-xl border border-border p-4 space-y-3 self-start">
        <h2 id="groups-title" className="text-base font-semibold">קבוצות גישה</h2>
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setGroupId(groupId === g.id ? null : g.id)}
                aria-pressed={groupId === g.id}
                className={`w-full text-start rounded-lg border p-3 ${groupId === g.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-sm">{g.name}</span>
                  <span className="text-xs text-muted-foreground">{g.system_access_group_resources.length} משאבים</span>
                </div>
                {g.external_name && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    קבוצה חיצונית: <span dir="ltr">{g.external_name}</span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
        <form className="space-y-2 pt-2 border-t border-border" onSubmit={(e) => { e.preventDefault(); void addGroup(); }}>
          <FormField label="קבוצה חדשה" required>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="הנדסה" className={inputClass} />
          </FormField>
          <FormField label="שם הקבוצה ב-Active Directory" hint="מה איש ה-IT מוסיף אליו את העובד">
            <input value={draft.external_name} onChange={(e) => setDraft({ ...draft, external_name: e.target.value })} dir="ltr" className={inputClass} />
          </FormField>
          <Button type="submit" size="sm" disabled={!draft.name.trim()} loading={saveGroup.isPending} loadingText="מוסיף…">
            <Plus className="w-4 h-4" /> הוסף קבוצה
          </Button>
        </form>
      </section>
    </div>
  );
}
