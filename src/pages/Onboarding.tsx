import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserPlus, Search, Send, UserRound, AlertCircle } from "lucide-react";
import { NewOnboardingDialog } from "@/components/onboarding/NewOnboardingDialog";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import { SendToOpsDialog } from "@/components/onboarding/SendToOpsDialog";
import {
  ONBOARDING_STATUS_LABEL,
  daysUntil,
  useOnboardingProcesses,
  useUpdateOnboardingProcess,
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
  const updateProcess = useUpdateOnboardingProcess();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<OnboardingProcess | null>(null);
  const [sendTarget, setSendTarget] = useState<OnboardingProcess | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | "all">("all");

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

  // Keep the open sheet in sync with refreshed data.
  const openProcess = selected ? processes.find((p) => p.id === selected.id) ?? selected : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">קליטת עובדים</h1>
          <p className="page-subtitle">ניהול תהליכי הקליטה — מהזנת הצרכים ועד מסירת הציוד</p>
        </div>
        <Button className="gap-2 w-full sm:w-auto" onClick={() => setDialogOpen(true)}>
          <UserPlus className="w-4 h-4" />
          תהליך קליטה חדש
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם או מזהה עובד"
            className="w-full pr-9 pl-3 py-2 bg-card border border-border rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="grid grid-cols-3 sm:flex gap-1.5 w-full sm:w-auto">
          {(["all", "draft", "sent", "in_progress", "done"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`min-w-0 px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap border transition-colors ${
                statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
              }`}
            >
              {s === "all" ? "הכל" : ONBOARDING_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card divide-y divide-border/50">
        {isLoading && <div className="p-8 text-center text-muted-foreground text-sm">טוען...</div>}
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
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="p-10 text-center text-muted-foreground text-sm">אין תהליכי קליטה להצגה</div>
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
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.employees?.full_name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status]}`}>
                    {ONBOARDING_STATUS_LABEL[p.status]}
                  </span>
                  {p.status !== "done" && d !== null && d <= 2 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">
                      {d >= 0 ? `מתחיל בעוד ${d} ימים` : "כבר התחיל"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.employees?.role} · {p.employees?.department} · תחילת עבודה{" "}
                  {p.employees?.start_date ? new Date(p.employees.start_date).toLocaleDateString("en-GB") : "—"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {done}/{items.length} פריטים
                </span>
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
