import { Checkbox } from "@/components/ui/checkbox";
import { useAccessPickerCatalog, useAccessSystems } from "@/hooks/useSystemAccess";
import type { PickState } from "@/domain/systemAccess/picks";

interface Props {
  value: PickState;
  onChange: (next: PickState) => void;
  /** The employee's first day at 08:00 as a datetime-local value ("" when unknown). */
  defaultFrom: string;
  disabled?: boolean;
}

const chip = (on: boolean) =>
  `inline-flex items-center min-h-9 px-3 py-1 rounded-full text-xs border transition-colors ${
    on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:bg-muted"
  }`;

/**
 * Systems of the organisation with their access groups and environments. A checked system with
 * nothing chosen inside it is requested as a whole. Each system has its own start time.
 */
export function AccessPicker({ value, onChange, defaultFrom, disabled }: Props) {
  const { data: systems = [] } = useAccessSystems();
  const { data: catalog } = useAccessPickerCatalog();
  const active = systems.filter((s) => s.is_active);

  const toggleSystem = (id: string) => {
    const next = { ...value };
    if (next[id]) delete next[id];
    else next[id] = { groupIds: [], resourceIds: [], effectiveFrom: defaultFrom };
    onChange(next);
  };
  const toggleIn = (systemId: string, key: "groupIds" | "resourceIds", id: string) => {
    const entry = value[systemId];
    if (!entry) return;
    const list = entry[key].includes(id) ? entry[key].filter((x) => x !== id) : [...entry[key], id];
    onChange({ ...value, [systemId]: { ...entry, [key]: list } });
  };
  const setFrom = (systemId: string, effectiveFrom: string) =>
    onChange({ ...value, [systemId]: { ...value[systemId], effectiveFrom } });

  if (active.length === 0) {
    return <p className="text-sm text-muted-foreground">עוד לא הוגדרו מערכות במסך הרשאות מערכות.</p>;
  }

  return (
    <ul className="space-y-2">
      {active.map((s) => {
        const entry = value[s.id];
        const groups = catalog?.groups.filter((g) => g.system_id === s.id) ?? [];
        const resources = catalog?.resources.filter((r) => r.system_id === s.id) ?? [];
        // Systems with access groups are picked by group; the folders behind them stay with IT.
        const offerResources = groups.length === 0 ? resources : [];
        return (
          <li key={s.id} className="rounded-lg bg-muted/40 p-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox checked={!!entry} onCheckedChange={() => toggleSystem(s.id)} disabled={disabled} />
              <span className="text-sm font-medium">{s.name}</span>
            </label>
            {entry && (
              <div className="mt-2 ps-7 space-y-2">
                {(groups.length > 0 || offerResources.length > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`${s.name}: מה לפתוח`}>
                    <span className="text-xs text-muted-foreground">{groups.length > 0 ? "קבוצות גישה:" : `${s.resource_label}:`}</span>
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        aria-pressed={entry.groupIds.includes(g.id)}
                        onClick={() => toggleIn(s.id, "groupIds", g.id)}
                        disabled={disabled}
                        className={chip(entry.groupIds.includes(g.id))}
                      >
                        {g.name}
                      </button>
                    ))}
                    {offerResources.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        aria-pressed={entry.resourceIds.includes(r.id)}
                        onClick={() => toggleIn(s.id, "resourceIds", r.id)}
                        disabled={disabled}
                        className={chip(entry.resourceIds.includes(r.id))}
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
                {entry.groupIds.length === 0 && entry.resourceIds.length === 0 && (groups.length > 0 || offerResources.length > 0) && (
                  <p className="text-xs text-muted-foreground">בלי בחירה תתבקש הרשאה למערכת כולה.</p>
                )}
                <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  בתוקף מ
                  <input
                    type="datetime-local"
                    value={entry.effectiveFrom}
                    onChange={(e) => setFrom(s.id, e.target.value)}
                    disabled={disabled}
                    className="min-h-9 px-2 bg-background border border-border rounded-lg text-sm text-foreground"
                  />
                  {!entry.effectiveFrom && <span>(ברירת מחדל: היום הראשון לעבודה, 08:00)</span>}
                </label>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
