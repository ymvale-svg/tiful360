import { useMemo, useState } from "react";
import { FileText, Inbox, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useData";
import {
  useAccessRequests,
  useDispatchAccess,
  useGenerateAccessProtocol,
  useProvisionTiful360,
  useRequestAccess,
  useResolveGrant,
} from "@/hooks/useSystemAccess";
import { AccessPicker } from "@/components/systemAccess/AccessPicker";
import { OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import { formatDateTimeDMY } from "@/lib/utils";
import {
  canDispatch,
  canReject,
  canResolve,
  canReturn,
  defaultEffectiveLocal,
  isOpenInRequest,
  isRevoking,
  isSystemOwner,
  picksToItems,
  toLocalInput,
  type Actor,
  type PickState,
} from "@/domain/systemAccess/picks";
import { GRANT_STATUS_LABEL, grantLabel, type AccessGrant, type AccessRequest, type GrantStatus } from "@/domain/systemAccess/types";
import type { GrantAction } from "@/services/systemAccess";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const inputClass = "w-full min-h-10 px-3 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30";

const STATUS_STYLE: Record<GrantStatus, string> = {
  requested: "bg-warning/10 text-warning",
  dispatched: "bg-info/10 text-info",
  active: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
  revoke_requested: "bg-warning/10 text-warning",
  revoke_dispatched: "bg-info/10 text-info",
  revoked: "bg-muted text-muted-foreground",
};

/** Requests waiting for action: the manager dispatches or executes, owners execute what was sent to them. */
export function RequestsTab() {
  const { user, roles, hasRole } = useAuth();
  const actor: Actor = useMemo(
    () => ({ userId: user?.id ?? null, roles, isManager: hasRole("admin") }),
    [user?.id, roles, hasRole],
  );
  const canRequest = hasRole("admin") || hasRole("hr") || hasRole("operations") || hasRole("it_manager");
  const [status, setStatus] = useState<"open" | "done">("open");
  const [mineOnly, setMineOnly] = useState(!actor.isManager);
  const [newOpen, setNewOpen] = useState(false);
  const { data: requests = [], isLoading, error, refetch } = useAccessRequests(status);

  const shown = useMemo(
    () =>
      mineOnly && status === "open"
        ? requests.filter((r) => r.system_access_grants.some((g) => canResolve(g, actor) || canDispatch(g, actor)))
        : requests,
    [requests, mineOnly, status, actor],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="סינון בקשות">
          <Button size="sm" variant={status === "open" ? "default" : "outline"} aria-pressed={status === "open"} onClick={() => setStatus("open")}>פתוחות</Button>
          <Button size="sm" variant={status === "done" ? "default" : "outline"} aria-pressed={status === "done"} onClick={() => setStatus("done")}>הושלמו</Button>
          {status === "open" && (
            <Button size="sm" variant={mineOnly ? "default" : "outline"} aria-pressed={mineOnly} onClick={() => setMineOnly((v) => !v)}>
              ממתין לי
            </Button>
          )}
        </div>
        {canRequest && (
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="w-4 h-4" /> בקשת הרשאות
          </Button>
        )}
      </div>

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        isEmpty={shown.length === 0}
        label="בקשות הרשאה"
        empty={{
          title: status === "open" ? "אין בקשות שממתינות" : "אין בקשות שהושלמו",
          description: status === "open" ? "בקשות חדשות מגיעות מטופס הקליטה או מכפתור בקשת הרשאות." : undefined,
          icon: <Inbox className="w-6 h-6" />,
        }}
      >
        <div className="space-y-3">
          {shown.map((r) => <RequestCard key={r.id} request={r} actor={actor} />)}
        </div>
      </StateView>

      <NewAccessRequestDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function RequestCard({ request, actor }: { request: AccessRequest; actor: Actor }) {
  const { toast } = useToast();
  const dispatch = useDispatchAccess();
  const provision = useProvisionTiful360();
  const protocol = useGenerateAccessProtocol();

  const makeProtocol = async () => {
    try {
      const { blob, fileName } = await protocol.mutateAsync({ employeeId: request.employee_id });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast({ title: "הפרוטוקול הופק ונשמר בתיק העובד" });
    } catch (e) {
      toast({ title: "הפרוטוקול לא הופק", description: message(e), variant: "destructive" });
    }
  };
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [action, setAction] = useState<{ grant: AccessGrant; kind: GrantAction } | null>(null);
  const grants = [...request.system_access_grants].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const emp = request.employees;
  const dispatchable = grants.filter((g) => canDispatch(g, actor));
  const revoke = request.kind === "revoke";
  const done = grants.filter((g) => !isOpenInRequest(request.kind, g)).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openTiful360User = async (g: AccessGrant) => {
    if (!emp) return;
    setProvisioningId(g.id);
    try {
      const email = await provision.mutateAsync({
        grantId: g.id,
        employee: { id: request.employee_id, email: emp.email, full_name: emp.full_name },
      });
      toast({ title: "נפתח משתמש בתפעול 360", description: `הזמנה נשלחה אל ${email}` });
    } catch (e) {
      toast({ title: "פתיחת המשתמש נכשלה", description: message(e), variant: "destructive" });
    } finally {
      setProvisioningId(null);
    }
  };

  const send = async () => {
    try {
      const tickets = await dispatch.mutateAsync({ grantIds: [...selected], note });
      setSelected(new Set());
      setNote("");
      toast({
        title: tickets.length === 1 ? "נפתחה קריאה לאחראי" : `נפתחו ${tickets.length} קריאות לאחראים`,
        description: tickets.map((t) => `${t.ticketCode} · ${OWNER_ROLE_LABEL[t.ownerRole] ?? t.ownerRole}`).join(" · "),
      });
    } catch (e) {
      toast({ title: "השליחה נכשלה", description: message(e), variant: "destructive" });
    }
  };

  return (
    <article className="rounded-xl border border-border p-4 space-y-3" aria-labelledby={`req-${request.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`req-${request.id}`} className="text-base font-semibold flex items-center gap-2">
            {emp?.full_name ?? "עובד"}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${revoke ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {revoke ? "ניתוק" : "פתיחה"}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            {[emp?.role, emp?.department].filter(Boolean).join(" · ")}
            {emp?.start_date ? ` · תחילת עבודה ${new Date(emp.start_date).toLocaleDateString("en-GB")}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">
            ביקש/ה: {request.requested_by_name} · {formatDateTimeDMY(request.requested_at)}
            {request.onboarding_process_id ? " · מקליטת עובד" : ""}
          </p>
          {request.note && <p className="text-sm mt-1">{request.note}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-muted-foreground">{done}/{grants.length} טופלו</span>
          <Button size="sm" variant="outline" onClick={() => { void makeProtocol(); }} loading={protocol.isPending} loadingText="מפיק…">
            <FileText className="w-4 h-4" /> פרוטוקול
          </Button>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th scope="col" className="w-8 py-2 px-1"><span className="sr-only">בחירה לשליחה</span></th>
              <th scope="col" className="text-start font-medium py-2 px-2">הרשאה</th>
              <th scope="col" className="text-start font-medium py-2 px-2">{revoke ? "לנתק עד" : "בתוקף מ"}</th>
              <th scope="col" className="text-start font-medium py-2 px-2">אחראי</th>
              <th scope="col" className="text-start font-medium py-2 px-2">סטטוס</th>
              <th scope="col" className="text-start font-medium py-2 px-2"><span className="sr-only">פעולות</span></th>
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => {
              const label = grantLabel(g);
              const owner = g.system_access_systems ? OWNER_ROLE_LABEL[g.system_access_systems.owner_role] ?? g.system_access_systems.owner_role : "";
              return (
                <tr key={g.id} className="border-b border-border/60 align-top">
                  <td className="py-2 px-1">
                    {canDispatch(g, actor) && (
                      <Checkbox checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={`בחר את ${label} לשליחה`} />
                    )}
                  </td>
                  <th scope="row" className="text-start font-medium py-2 px-2">
                    {label}
                    {g.external_username && <div className="text-xs font-normal text-muted-foreground">משתמש: <span dir="ltr">{g.external_username}</span></div>}
                    {g.note && <div className="text-xs font-normal text-muted-foreground">{g.note}</div>}
                    {g.rejection_reason && <div className="text-xs font-normal text-destructive">סיבת דחייה: {g.rejection_reason}</div>}
                  </th>
                  <td className="py-2 px-2 tabular-nums whitespace-nowrap">
                    {revoke ? (g.revoke_due_at ? formatDateTimeDMY(g.revoke_due_at) : "—") : formatDateTimeDMY(g.effective_from)}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">{owner}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[g.status]}`}>{GRANT_STATUS_LABEL[g.status]}</span>
                    {revoke && g.status === "active" && <div className="text-xs text-muted-foreground mt-1">הניתוק בוטל</div>}
                    {revoke ? (
                      g.revoked_at && (
                        <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          {g.revoked_by_name} · {formatDateTimeDMY(g.revoked_at)}
                        </div>
                      )
                    ) : (
                      g.executed_at && (
                        <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                          {g.executed_by_name} · {formatDateTimeDMY(g.executed_at)}
                        </div>
                      )
                    )}
                    {revoke && g.revoke_note && <div className="text-xs text-muted-foreground mt-1">{g.revoke_note}</div>}
                  </td>
                  <td className="py-2 px-2">
                    {canResolve(g, actor) && (
                      <div className="flex flex-wrap gap-1.5">
                        {g.system_access_systems?.provisioning === "auto_tiful360" && actor.isManager && !isRevoking(g) ? (
                          <Button size="sm" onClick={() => { void openTiful360User(g); }} loading={provisioningId === g.id} loadingText="פותח…">
                            פתח משתמש
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setAction({ grant: g, kind: "done" })}>
                            {isRevoking(g) ? "נותק" : "בוצע"}
                          </Button>
                        )}
                        {canReturn(g) && isSystemOwner(g, actor) ? (
                          <Button size="sm" variant="ghost" onClick={() => setAction({ grant: g, kind: "return" })}>החזר</Button>
                        ) : (
                          canReject(g) && <Button size="sm" variant="ghost" onClick={() => setAction({ grant: g, kind: "reject" })}>דחה</Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dispatchable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-muted/40 p-3">
          <FormField label="הערה לאחראי (לא חובה)" className="flex-1 min-w-48">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </FormField>
          <Button onClick={() => { void send(); }} disabled={selected.size === 0} loading={dispatch.isPending} loadingText="שולח…">
            <Send className="w-4 h-4" /> {revoke ? "שלח לאחראי לניתוק" : "שלח לאחראי"} ({selected.size})
          </Button>
        </div>
      )}

      <GrantActionDialog action={action} onClose={() => setAction(null)} />
    </article>
  );
}

const ACTION_TITLE: Record<GrantAction, string> = { done: "סימון כבוצע", reject: "דחיית הרשאה", return: "החזרה למנהל ההרשאות" };

function GrantActionDialog({ action, onClose }: { action: { grant: AccessGrant; kind: GrantAction } | null; onClose: () => void }) {
  const { toast } = useToast();
  const resolve = useResolveGrant();
  const [executedAt, setExecutedAt] = useState("");
  const [username, setUsername] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const kind = action?.kind;
  const revoking = !!action && isRevoking(action.grant);
  const needsReason = kind === "reject" || kind === "return";

  const reset = () => { setExecutedAt(""); setUsername(""); setNote(""); setError(null); };

  const submit = async () => {
    if (!action) return;
    if (needsReason && !note.trim()) {
      setError("נדרש הסבר");
      return;
    }
    try {
      await resolve.mutateAsync({
        grantId: action.grant.id,
        action: action.kind,
        executedAt: kind === "done" && executedAt ? new Date(executedAt).toISOString() : null,
        externalUsername: username,
        note,
      });
      toast({ title: kind === "done" ? (revoking ? "סומן כנותק" : "סומן כבוצע") : kind === "reject" ? "ההרשאה נדחתה" : "הוחזר למנהל ההרשאות" });
      reset();
      onClose();
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <Dialog open={!!action} onOpenChange={(o) => { if (!o && !resolve.isPending) { reset(); onClose(); } }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "done" && revoking ? "סימון כנותק" : kind ? ACTION_TITLE[kind] : ""}</DialogTitle>
          <DialogDescription>{action ? grantLabel(action.grant) : ""}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {kind === "done" && (
            <>
              <FormField label={revoking ? "מתי נותק בפועל" : "מתי נפתח בפועל"} hint="ריק = עכשיו. לא ניתן לבחור זמן עתידי.">
                <input type="datetime-local" value={executedAt} max={toLocalInput(new Date().toISOString())} onChange={(e) => setExecutedAt(e.target.value)} className={inputClass} />
              </FormField>
              {!revoking && (
                <FormField label="שם המשתמש שנפתח במערכת" hint="לא חובה">
                  <input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" className={inputClass} />
                </FormField>
              )}
            </>
          )}
          <FormField label={needsReason ? (kind === "reject" ? "סיבת הדחייה" : "למה מוחזר") : "הערה (לא חובה)"} required={needsReason} error={error}>
            <textarea value={note} onChange={(e) => { setNote(e.target.value); setError(null); }} rows={3} className={`${inputClass} py-2`} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { reset(); onClose(); }} disabled={resolve.isPending}>ביטול</Button>
            <Button type="submit" variant={kind === "reject" ? "destructive" : "default"} loading={resolve.isPending} loadingText="שומר…">
              {kind === "done" && revoking ? "סימון כנותק" : kind ? ACTION_TITLE[kind] : ""}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A request outside onboarding, e.g. an employee moving department. */
function NewAccessRequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const request = useRequestAccess();
  const [employeeId, setEmployeeId] = useState("");
  const [picks, setPicks] = useState<PickState>({});
  const [note, setNote] = useState("");
  const employee = (employees as Array<{ id: string; full_name: string; role?: string | null; status?: string; start_date?: string | null }>)
    .find((e) => e.id === employeeId);
  const defaultFrom = defaultEffectiveLocal(employee?.start_date && new Date(employee.start_date) > new Date() ? employee.start_date : null);

  const close = () => { setEmployeeId(""); setPicks({}); setNote(""); onOpenChange(false); };

  const submit = async () => {
    const items = picksToItems(picks, defaultFrom);
    if (!employeeId || items.length === 0) return;
    try {
      const res = await request.mutateAsync({ employeeId, picks: items, note });
      toast({
        title: "הבקשה נשלחה",
        description: `${res.created} הרשאות · קריאה ${res.ticketCode}${res.skipped ? ` · ${res.skipped} כבר קיימות ולא נשלחו שוב` : ""}`,
      });
      close();
    } catch (e) {
      toast({ title: "הבקשה לא נשלחה", description: message(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !request.isPending) close(); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>בקשת הרשאות</DialogTitle>
          <DialogDescription>לעובד קיים, למשל במעבר מחלקה. הבקשה מגיעה למנהל ההרשאות.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="עובד" required>
            <SearchableSelect
              value={employeeId}
              onChange={setEmployeeId}
              options={(employees as Array<{ id: string; full_name: string; role?: string | null; status?: string }>)
                .filter((e) => e.status === "active" || e.status === "onboarding")
                .map((e) => ({ value: e.id, label: `${e.full_name}${e.role ? ` · ${e.role}` : ""}` }))}
            />
          </FormField>
          {employeeId && <AccessPicker value={picks} onChange={setPicks} defaultFrom={defaultFrom} />}
          <FormField label="הערה (לא חובה)">
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={request.isPending}>ביטול</Button>
            <Button onClick={() => { void submit(); }} disabled={!employeeId || Object.keys(picks).length === 0} loading={request.isPending} loadingText="שולח…">
              <Send className="w-4 h-4" /> שלח בקשה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
