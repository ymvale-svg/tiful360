import { Link } from "react-router-dom";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamLeaveRequests } from "@/hooks/useLeaveRequests";
import { buildGoogleCalendarUrl } from "@/lib/googleCalendar";

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר",
};
const STATUS_LABELS: Record<string, string> = {
  approved: "מאושר",
};
const STATUS_CLASS: Record<string, string> = {
  approved: "bg-success/15 text-success",
};

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB");

export function LeaveStatusCard() {
  const { data: requests = [], isLoading } = useTeamLeaveRequests();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const recent = [...requests]
    .filter((r: any) => r.status === "approved")
    .filter((r: any) => {
      const last = new Date(r.end_date ?? r.start_date);
      last.setHours(0, 0, 0, 0);
      return last.getTime() >= today.getTime();
    })
    .sort(
      (a: any, b: any) =>
        new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    )
    .slice(0, 8);




  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          בקשות חופשה ומחלה
        </h2>
        <Link to="/leave-requests" className="text-xs text-primary hover:underline">הצג הכל</Link>
      </div>
      <div className="divide-y divide-border/50">
        {isLoading && <div className="p-6 text-center text-sm text-muted-foreground">טוען...</div>}
        {!isLoading && recent.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">אין בקשות</div>
        )}
        {recent.map((r: any) => (
          <div key={r.id} className="p-4 flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{r.employee?.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_LABELS[r.request_type] ?? r.request_type} •{" "}
                {r.end_date
                  ? r.start_date === r.end_date
                    ? fmt(r.start_date)
                    : `${fmt(r.start_date)} – ${fmt(r.end_date)}`
                  : `${fmt(r.start_date)} – ?`}
                {r.end_date && r.total_days ? ` • ${r.total_days} ימים` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {r.end_date && (
                <a
                  href={buildGoogleCalendarUrl({
                    title: `${r.employee?.full_name ?? "עובד"} ${r.request_type === "sick" ? "במחלה" : "בחופש"}`,
                    startDate: r.start_date,
                    endDate: r.end_date,
                    details: `${TYPE_LABELS[r.request_type] ?? r.request_type}${r.reason ? ` — ${r.reason}` : ""}`,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <CalendarPlus className="w-3 h-3" />
                    ליומן
                  </Button>
                </a>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_CLASS[r.status]}`}>
                {STATUS_LABELS[r.status] ?? r.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
