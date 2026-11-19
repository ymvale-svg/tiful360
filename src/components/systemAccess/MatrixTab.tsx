import { useMemo, useState } from "react";
import { FileText, Grid3x3, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useAccessSystems, useGenerateAccessProtocol, useHeldGrants, useRequestRevocation } from "@/hooks/useSystemAccess";
import { buildMatrix, bySystem, departmentsOf, filterMatrix, accessTarget } from "@/domain/systemAccess/matrix";
import { formatIsraelDateTime } from "@/domain/systemAccess/protocol";
import { unusualGrant } from "@/domain/suggestions/peers";
import { useEmployees } from "@/hooks/useData";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const selectClass = "min-h-10 px-2 bg-card border border-border rounded-lg text-sm";

/** Who holds which access now: by employee (all systems) or by system (everyone in it). */
export function MatrixTab() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const { hasRole } = useAuth();
  const canRevoke = hasRole("admin") || hasRole("hr") || hasRole("operations") || hasRole("it_manager");
  const { data: grants = [], isLoading, error, refetch } = useHeldGrants();
  const { data: systems = [] } = useAccessSystems();
  const revoke = useRequestRevocation();
  const protocol = useGenerateAccessProtocol();
  const [view, setView] = useState<"employee" | "system">("employee");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [systemId, setSystemId] = useState("");
  const [protocolFor, setProtocolFor] = useState<string | null>(null);
  const [unusualOnly, setUnusualOnly] = useState(false);
  const { data: employees = [] } = useEmployees();
  // Access no peer in the same role (and department) holds: what a periodic review looks at first.
  const unusual = useMemo(
    () => new Set(grants.filter((g) => unusualGrant(g, employees, grants)).map((g) => g.id)),
    [grants, employees],
  );

  const matrix = useMemo(() => buildMatrix(grants), [grants]);
  const departments = useMemo(() => departmentsOf(matrix), [matrix]);
  // Columns: active systems plus any system someone still holds access to.
  const columns = useMemo(
    () => systems.filter((s) => s.is_active || grants.some((g) => g.system_id === s.id)),
    [systems, grants],
  );
  const rows = filterMatrix(matrix, { query, department: department || null, systemId: view === "employee" ? systemId || null : null })
    .filter((r) => !unusualOnly || Object.values(r.cells).flat().some((c) => unusual.has(c.grantId)));
  const selectedSystem = systemId || columns[0]?.id || "";
  const systemRows = useMemo(
    () => (view === "system" && selectedSystem ? bySystem(grants, selectedSystem) : [])
      .filter((r) => (!query.trim() || (r.grant.employees?.full_name ?? "").includes(query.trim()))
        && (!department || r.grant.employees?.department === department)
        && (!unusualOnly || unusual.has(r.grant.id))),
    [view, selectedSystem, grants, query, department, unusualOnly, unusual],
  );

  const makeProtocol = async (employeeId: string, name: string) => {
    setProtocolFor(employeeId);
    try {
      const { blob, fileName } = await protocol.mutateAsync({ employeeId });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast({ title: "הפרוטוקול הופק", description: `נשמר בתיק של ${name}` });
    } catch (e) {
      toast({ title: "הפרוטוקול לא הופק", description: message(e), variant: "destructive" });
    } finally {
      setProtocolFor(null);
    }
  };

  const revokeAccess = (employeeId: string, name: string, grantIds: string[] | null, what: string) =>
    confirm({
      title: `לנתק ל${name} ${what}?`,
      description: "תיפתח בקשת ניתוק למנהל ההרשאות, והוא ינתק או ישלח לאחראים.",
      confirmLabel: "פתח בקשת ניתוק",
      destructive: true,
      onConfirm: async () => {
        const res = await revoke.mutateAsync({ employeeId, grantIds, note: "ניתוק ממטריצת ההרשאות" });
        toast({ title: "נפתחה בקשת ניתוק", description: `${res.count} הרשאות · קריאה ${res.ticketCode}` });
      },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="תצוגה" className="flex gap-1.5">
          <Button size="sm" variant={view === "employee" ? "default" : "outline"} aria-pressed={view === "employee"} onClick={() => setView("employee")}>לפי עובד</Button>
          <Button size="sm" variant={view === "system" ? "default" : "outline"} aria-pressed={view === "system"} onClick={() => setView("system")}>לפי מערכת</Button>
        </div>
        <SearchInput wrapperClassName="flex-1 min-w-48" label="חיפוש עובד" placeholder="חיפוש עובד" value={query} onValueChange={setQuery} />
        <select value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="מחלקה" className={selectClass}>
          <option value="">כל המחלקות</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={view === "system" ? selectedSystem : systemId}
          onChange={(e) => setSystemId(e.target.value)}
          aria-label="מערכת"
          className={selectClass}
        >
          {view === "employee" && <option value="">כל המערכות</option>}
          {columns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button
          size="sm"
          variant={unusualOnly ? "default" : "outline"}
          aria-pressed={unusualOnly}
          onClick={() => setUnusualOnly((v) => !v)}
          title="הרשאות שאף עובד אחר באותו תפקיד ומחלקה לא מחזיק"
        >
          רק חריגים ({unusual.size})
        </Button>
      </div>

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={view === "employee" ? rows.length === 0 : systemRows.length === 0}
        label="מטריצת הרשאות"
        empty={{
          title: grants.length === 0 ? "עוד אין הרשאות פעילות" : "אין תוצאות לסינון",
          description: grants.length === 0 ? "הרשאות מופיעות כאן מרגע שהן נפתחות." : undefined,
          icon: <Grid3x3 className="w-6 h-6" />,
        }}
      >
        {view === "employee" ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">הרשאות פעילות לפי עובד ומערכת</caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th scope="col" className="text-start font-medium py-2 px-3 sticky start-0 bg-muted/30">עובד</th>
                  {columns.map((s) => <th key={s.id} scope="col" className="text-start font-medium py-2 px-3 whitespace-nowrap">{s.name}</th>)}
                  <th scope="col" className="py-2 px-3"><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-b border-border/60 align-top">
                    <th scope="row" className="text-start font-medium py-2 px-3 whitespace-nowrap sticky start-0 bg-background">
                      {r.name}
                      <div className="text-xs font-normal text-muted-foreground">
                        {r.department ?? ""}{r.leaving ? " · בתהליך עזיבה" : ""}
                      </div>
                    </th>
                    {columns.map((s) => (
                      <td key={s.id} className="py-2 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.cells[s.id] ?? []).map((c) => (
                            <span
                              key={c.grantId}
                              className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                                c.revoking ? "bg-warning/10 text-warning line-through"
                                  : unusual.has(c.grantId) ? "bg-warning/15 text-foreground ring-1 ring-warning/50"
                                  : "bg-primary/10 text-primary"}`}
                              title={c.revoking ? "ממתין לניתוק" : unusual.has(c.grantId) ? "חריג: אף עובד דומה לא מחזיק הרשאה זו" : undefined}
                            >
                              {c.label}
                              {c.revoking && <span className="sr-only"> (ממתין לניתוק)</span>}
                              {!c.revoking && unusual.has(c.grantId) && <span className="sr-only"> (חריג לתפקיד)</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    ))}
                    <td className="py-2 px-3">
                      <div className="flex gap-1.5 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { void makeProtocol(r.employeeId, r.name); }}
                          loading={protocolFor === r.employeeId}
                          loadingText="מפיק…"
                          aria-label={`פרוטוקול הרשאות של ${r.name}`}
                        >
                          <FileText className="w-4 h-4" /> פרוטוקול
                        </Button>
                        {canRevoke && Object.values(r.cells).flat().some((c) => !c.revoking) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { void revokeAccess(r.employeeId, r.name, null, "את כל ההרשאות"); }}
                            aria-label={`ניתוק כל ההרשאות של ${r.name}`}
                          >
                            <Unplug className="w-4 h-4" /> נתק הכול
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <caption className="sr-only">כל מי שיש לו הרשאה למערכת שנבחרה</caption>
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <th scope="col" className="text-start font-medium py-2 px-3">עובד</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">הרשאה</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">בתוקף מ</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">נפתח</th>
                  <th scope="col" className="text-start font-medium py-2 px-3">משתמש</th>
                  <th scope="col" className="py-2 px-3"><span className="sr-only">פעולות</span></th>
                </tr>
              </thead>
              <tbody>
                {systemRows.map(({ grant: g, revoking }) => (
                  <tr key={g.id} className="border-b border-border/60">
                    <th scope="row" className="text-start font-medium py-2 px-3">
                      {g.employees?.full_name ?? "—"}
                      <div className="text-xs font-normal text-muted-foreground">{g.employees?.department ?? ""}</div>
                    </th>
                    <td className="py-2 px-3">
                      {accessTarget(g)}
                      {revoking && <span className="ms-2 text-xs text-warning">ממתין לניתוק</span>}
                      {!revoking && unusual.has(g.id) && <span className="ms-2 text-xs text-warning">חריג לתפקיד</span>}
                    </td>
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">{formatIsraelDateTime(g.effective_from)}</td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="tabular-nums">{formatIsraelDateTime(g.executed_at)}</span>
                      {g.executed_by_name && <div className="text-xs text-muted-foreground">{g.executed_by_name}</div>}
                    </td>
                    <td className="py-2 px-3" dir="ltr">{g.external_username ?? "—"}</td>
                    <td className="py-2 px-3">
                      {canRevoke && !revoking && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { void revokeAccess(g.employee_id, g.employees?.full_name ?? "העובד", [g.id], accessTarget(g)); }}
                        >
                          <Unplug className="w-4 h-4" /> נתק
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </StateView>
    </div>
  );
}
