import { useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { ActiveFilters } from "@/components/ui/active-filters";
import { EMPTY_ICONS } from "@/components/feedback/emptyIcons";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserPlus, Send, UserRound, AlertCircle, ListChecks, Settings2, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, ListSkeleton } from "@/components/feedback/StateView";
import { NewOnboardingDialog } from "@/components/onboarding/NewOnboardingDialog";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { SendToOpsDialog } from "@/components/onboarding/SendToOpsDialog";
import { OnboardingCatalogSettings } from "@/components/onboarding/OnboardingCatalogSettings";
import { useAuth } from "@/hooks/useAuth";
import { EmployeeLink } from "@/components/EmployeeLink";
import {
  ONBOARDING_STATUS_LABEL,
  daysUntil,
  useOnboardingProcesses,
  useDeleteOnboardingProcesses,
  type OnboardingProcess,
  type OnboardingStatus,
} from "@/hooks/useOnboarding";

const STATUS_STYLE: Record<OnboardingStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/10 text-info",
  in_progress: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { data: processes = [], isLoading, isError, error, refetch } = useOnboardingProcesses();
  const deleteProcesses = useDeleteOnboardingProcesses();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<OnboardingProcess | null>(null);
  const [sendTarget, setSendTarget] = useState<OnboardingProcess | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const { hasRole } = useAuth();
  const canManageCatalog = hasRole("admin") || hasRole("operations");
  // Only the company admin deletes onboarding processes (delete_onboarding_processes).
  const canDelete = hasRole("admin");

  const filtered = useMemo(() => {
    return processes.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return (
        (p.employees?.full_name ?? "").toLowerCase().includes(q) ||
        (p.employees?.employee_code ?? "").toLowerCase().includes(q)
      );
    });
  }, [processes, query, statusFilter]);

  // Selection is limited to what the filter shows, so a hidden process is never deleted by surprise.
  const selectedIds = filtered.filter((p) => checked.has(p.id)).map((p) => p.id);
  const allChecked = filtered.length > 0 && selectedIds.length === filtered.length;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(filtered.map((p) => p.id)));

  const deleteSelected = () => {
    const ids = selectedIds;
    if (ids.length === 0) return;
    const open = filtered.filter((p) => ids.includes(p.id) && p.status !== "done").length;
    void confirm({
      title: `למחוק ${ids.length} תהליכי קליטה?`,
      description: `הצ'קליסטים שלהם יימחקו לצמיתות${open ? `, קריאות קליטה פתוחות ייסגרו ועובדים שעדיין בסטטוס "בקליטה" יהפכו לפעילים` : ""}. העובדים עצמם, הציוד שכבר נמסר וההרשאות לא נמחקים.`,
      confirmLabel: `מחק ${ids.length}`,
      destructive: true,
      ...(ids.length > 5 ? { requireText: "מחק" } : {}),
      onConfirm: async () => {
        const res = await deleteProcesses.mutateAsync(ids);
        setChecked(new Set());
        if (selected && ids.includes(selected.id)) setSelected(null);
        toast({
          title: `${res.deleted} תהליכי קליטה נמחקו`,
          description: [
            res.ticketsClosed ? `${res.ticketsClosed} קריאות נסגרו` : "",
            res.employeesActivated ? `${res.employeesActivated} עובדים הוגדרו כפעילים` : "",
          ].filter(Boolean).join(" · ") || undefined,
        });
      },
    });
  };

  // Keep the open sheet in sync with refreshed data.
  const openProcess = selected ? processes.find((p) => p.id === selected.id) ?? selected : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">קליטת עובדים</h1>
          <p className="page-subtitle">ניהול תהליכי הקליטה — מהזנת הצרכים ועד מסירת הציוד</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canManageCatalog && (
            <Button size="touch" variant="outline" className="gap-2 w-full sm:w-auto" onClick={() => setCatalogOpen(true)}>
              <Settings2 className="w-4 h-4" />
              קטלוג הקליטה
            </Button>
          )}
          <Button size="touch" className="gap-2 w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
            <UserPlus className="w-4 h-4" />
            תהליך קליטה חדש
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <SearchInput
          wrapperClassName="flex-1"
          label="חיפוש תהליכי קליטה לפי שם או מזהה עובד"
          placeholder="חיפוש לפי שם או מזהה עובד"
          value={query}
          onValueChange={setQuery}
        />
        <div className="grid grid-cols-3 sm:flex gap-1.5 w-full sm:w-auto">
          {(["all", "draft", "sent", "in_progress", "done"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={statusFilter === s}
              onClick={() => setStatusFilter(s)}
              className={`min-w-0 min-h-11 px-2.5 py-1.5 rounded-lg text-sm whitespace-nowrap border transition-colors ${
                statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
              }`}
            >
              {s === "all" ? "הכל" : ONBOARDING_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card divide-y divide-border/50">
        {isLoading && (
          <div role="status" aria-busy="true">
            <span className="sr-only">טוען תהליכי קליטה…</span>
            <ListSkeleton rows={3} />
          </div>
        )}
        {!isLoading && isError && (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-6 h-6 text-destructive mx-auto" />
            <div>
              <p className="text-sm font-medium">לא ניתן לטעון את תהליכי הקליטה</p>
              <p className="text-xs text-muted-foreground mt-1">{error instanceof Error ? error.message : "אירעה שגיאה בטעינה"}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>נסה שוב</Button>
          </div>
        )}
        {!isLoading && !isError && processes.length > 0 && (
          <ActiveFilters
            summary={`${filtered.length} מתוך ${processes.length} תהליכים`}
            onClearAll={() => { setQuery(""); setStatusFilter("all"); }}
            filters={[
              ...(query.trim() ? [{ id: "q", label: "חיפוש", value: query.trim(), onRemove: () => setQuery("") }] : []),
              ...(statusFilter !== "all" ? [{ id: "status", label: "סטטוס", value: ONBOARDING_STATUS_LABEL[statusFilter], onRemove: () => setStatusFilter("all") }] : []),
            ]}
          />
        )}
        {canDelete && !isLoading && !isError && filtered.length > 0 && (
          <div className="px-4 py-2 flex flex-wrap items-center gap-3 bg-muted/20">
            <label className="flex items-center gap-2 text-sm cursor-pointer min-h-10">
              <Checkbox checked={allChecked ? true : selectedIds.length > 0 ? "indeterminate" : false} onCheckedChange={toggleAll} />
              בחר הכל ({filtered.length})
            </label>
            {selectedIds.length > 0 && (
              <Button size="sm" variant="destructive" className="gap-1.5 ms-auto" onClick={deleteSelected}>
                <Trash2 className="w-3.5 h-3.5" />
                מחק נבחרים ({selectedIds.length})
              </Button>
            )}
          </div>
        )}
        {!isLoading && !isError && filtered.length === 0 && (
          processes.length > 0 ? (
            <EmptyState
              icons={EMPTY_ICONS.noMatch}
              title="אין תהליכי קליטה שתואמים לסינון"
              description={[query.trim() && `חיפוש "${query.trim()}"`, statusFilter !== "all" && `סטטוס "${ONBOARDING_STATUS_LABEL[statusFilter]}"`].filter(Boolean).join(" ו")}
              action={<Button size="sm" variant="outline" onClick={() => { setQuery(""); setStatusFilter("all"); }}>נקה סינון</Button>}
            />
          ) : (
            <EmptyState
              icons={EMPTY_ICONS.onboarding}
              title="עדיין אין תהליכי קליטה"
              description="פתחו תהליך קליטה לעובד חדש כדי לרכז את הצרכים, הציוד והגישות שלו."
              action={<Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}><UserPlus className="w-4 h-4" />תהליך קליטה חדש</Button>}
            />
          )
        )}
        {filtered.map((p) => {
          const items = p.onboarding_items ?? [];
          const done = items.filter((i) => i.status === "done").length;
          const d = daysUntil(p.employees?.start_date);
          return (
            <div
              key={p.id}
              className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => setSelected(p)}
            >
              {canDelete && (
                <div className="flex items-center">
                  <Checkbox
                    checked={checked.has(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggle(p.id)}
                    aria-label={`בחירת תהליך הקליטה של ${p.employees?.full_name ?? "העובד"}`}
                    className="h-5 w-5"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">
                    <EmployeeLink employeeId={p.employee_id} name={p.employees?.full_name} />
                  </span>
                  <span className={`text-[0.8125rem] px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>
                    {ONBOARDING_STATUS_LABEL[p.status]}
                  </span>
                  {p.status !== "done" && d !== null && d <= 2 && (
                    <span className="text-[0.8125rem] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                      {d >= 0 ? `מתחיל בעוד ${d} ימים` : "כבר התחיל"}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {p.employees?.role} · {p.employees?.department} · תחילת עבודה{" "}
                  {p.employees?.start_date ? new Date(p.employees.start_date).toLocaleDateString("en-GB") : "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {done}/{items.length} פריטים
                </span>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(p);
                  }}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  פתח צ'קליסט
                  <span className="sr-only"> של {p.employees?.full_name}</span>
                </Button>
                {p.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSendTarget(p);
                    }}
                  >
                    <Send className="w-3.5 h-3.5" />
                    שלח לתפעול
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/employees/${p.employee_id}?tab=onboarding`);
                  }}
                >
                  <UserRound className="w-3.5 h-3.5" />
                  תיק עובד
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <OnboardingCatalogSettings open={catalogOpen} onOpenChange={setCatalogOpen} />
      <NewOnboardingDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <OnboardingChecklist process={openProcess} onOpenChange={(o) => !o && setSelected(null)} />
      <SendToOpsDialog
        open={!!sendTarget}
        onOpenChange={(o) => !o && setSendTarget(null)}
        processId={sendTarget?.id ?? null}
        employeeId={sendTarget?.employee_id ?? null}
        employeeName={sendTarget?.employees?.full_name}
        itemCount={sendTarget?.onboarding_items?.length}
        onSent={() => setSendTarget(null)}
      />
    </div>
  );
}
