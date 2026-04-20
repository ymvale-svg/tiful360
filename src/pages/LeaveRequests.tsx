import { useState, useMemo } from "react";
import { useTeamLeaveRequests } from "@/hooks/useLeaveRequests";
import { LeaveRequestsList } from "@/components/LeaveRequestsList";
import { ReviewLeaveRequestDialog } from "@/components/ReviewLeaveRequestDialog";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

const FILTERS = [
  { id: "pending", label: "ממתינות" },
  { id: "approved", label: "מאושרות" },
  { id: "rejected", label: "נדחו" },
  { id: "all", label: "הכל" },
];

export default function LeaveRequests() {
  const { data: requests = [], isLoading } = useTeamLeaveRequests();
  const [filter, setFilter] = useState("pending");
  const [reviewing, setReviewing] = useState<any | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r: any) => r.status === filter);
  }, [requests, filter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          בקשות חופשה ומחלה
        </h1>
        <p className="page-subtitle">ניהול ואישור בקשות של עובדים</p>
      </div>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
            {f.id !== "all" && (
              <span className="mr-1.5 text-[11px] opacity-80">
                ({requests.filter((r: any) => r.status === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">אין בקשות</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => (
            <div
              key={r.id}
              className="bg-card rounded-xl border border-border/50 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.employee?.department} • {{ vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר" }[r.request_type as string]} •{" "}
                    {r.total_days} ימים •{" "}
                    {new Date(r.start_date).toLocaleDateString("he-IL")} – {new Date(r.end_date).toLocaleDateString("he-IL")}
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                </div>
                {r.status === "pending" ? (
                  <Button size="sm" onClick={() => setReviewing(r)}>סקירה</Button>
                ) : (
                  <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${
                    r.status === "approved" ? "bg-success/15 text-success" :
                    r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {{ approved: "מאושר", rejected: "נדחה", cancelled: "בוטל" }[r.status as string]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ReviewLeaveRequestDialog request={reviewing} onClose={() => setReviewing(null)} />
    </div>
  );
}
