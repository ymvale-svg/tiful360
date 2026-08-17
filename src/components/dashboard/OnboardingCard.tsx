import { Link } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { useOnboardingProcesses, daysUntil, ONBOARDING_STATUS_LABEL } from "@/hooks/useOnboarding";

export function OnboardingCard() {
  const { data: processes = [] } = useOnboardingProcesses();
  const active = processes
    .filter((p) => p.status !== "done")
    .sort((a, b) => (a.employees?.start_date ?? "").localeCompare(b.employees?.start_date ?? ""));

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          עובדים בקליטה
        </h2>
        <Link to="/onboarding" className="text-xs text-primary hover:underline">הכל</Link>
      </div>
      <div className="divide-y divide-border/50">
        {active.slice(0, 4).map((p) => {
          const items = p.onboarding_items ?? [];
          const done = items.filter((i) => i.status === "done").length;
          const d = daysUntil(p.employees?.start_date);
          const urgent = d !== null && d <= 2;
          return (
            <Link
              key={p.id}
              to="/onboarding"
              className="p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.employees?.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {ONBOARDING_STATUS_LABEL[p.status]} · {done}/{items.length} פריטים
                </p>
              </div>
              {d !== null && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap ${
                    urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {d >= 0 ? `בעוד ${d} ימים` : "כבר התחיל"}
                </span>
              )}
            </Link>
          );
        })}
        {active.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">אין תהליכי קליטה פעילים</div>
        )}
      </div>
    </div>
  );
}
