import { useState, useMemo } from "react";
import { useTeamLeaveRequests } from "@/hooks/useLeaveRequests";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CalendarDays, Stethoscope, Paperclip, CalendarPlus } from "lucide-react";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { buildGoogleCalendarUrl } from "@/lib/googleCalendar";
import { exportToExcel } from "@/lib/exportExcel";

const TYPE_LABELS: Record<string, string> = { vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר" };
const STATUS_LABELS: Record<string, string> = { approved: "מאושר", rejected: "נדחה", cancelled: "בוטל", pending: "ממתין" };

export default function LeaveRequests() {
  const { isPayroll, isAdmin, isDirectManager, isHR } = useAuth();
  const { data: requests = [], isLoading } = useTeamLeaveRequests();

  // Tabs vary by role
  const tabs = useMemo(() => {
    const list: { id: string; label: string; icon?: any }[] = [];
    list.push({ id: "approved", label: "חופשות מדווחות", icon: CalendarDays });
    list.push({ id: "sick", label: "הצהרות מחלה", icon: Stethoscope });
    list.push({ id: "archive", label: "ארכיון" });
    return list;
  }, []);

  const [tab, setTab] = useState(tabs[0]?.id ?? "approved");

  const filtered = useMemo(() => {
    switch (tab) {
      case "sick":
        return requests.filter((r: any) => r.request_type === "sick");
      case "approved":
        return requests.filter((r: any) => r.status === "approved" && r.request_type !== "sick");
      case "archive":
        return requests.filter((r: any) => r.status === "rejected" || r.status === "cancelled");
      default:
        return requests;
    }
  }, [requests, tab]);

  const canReview = false;


  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            בקשות חופשה ומחלה
          </h1>
          <p className="page-subtitle">
            צפייה בדיווחי חופשה ומחלה של עובדים (ללא צורך באישור מנהל)
          </p>
        </div>
        <ExportExcelButton
          disabled={!filtered.length}
          onClick={() => {
            if (!filtered.length) return;
            exportToExcel(
              filtered.map((r: any) => ({
                full_name: r.employee?.full_name ?? "",
                department: r.employee?.department ?? "",
                request_type: TYPE_LABELS[r.request_type] ?? r.request_type,
                start_date: new Date(r.start_date).toLocaleDateString("en-GB"),
                end_date: r.end_date ? new Date(r.end_date).toLocaleDateString("en-GB") : "—",
                total_days: r.end_date ? r.total_days : "—",
                status: STATUS_LABELS[r.status] ?? r.status,
                reason: r.reason ?? "",
              })),
              [
                { key: "full_name", label: "שם עובד" },
                { key: "department", label: "מחלקה" },
                { key: "request_type", label: "סוג" },
                { key: "start_date", label: "מתאריך" },
                { key: "end_date", label: "עד תאריך" },
                { key: "total_days", label: "ימים" },
                { key: "status", label: "סטטוס" },
                { key: "reason", label: "סיבה" },
              ],
              "בקשות_חופשה"
            );
          }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sick" && (
        <p className="text-xs text-muted-foreground bg-info/10 border border-info/20 rounded-lg p-3">
          הצהרות מחלה נקלטות אוטומטית ונשלחות לידיעת המנהל הישיר וחשבות השכר.
        </p>
      )}

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
                    {r.employee?.department} • {TYPE_LABELS[r.request_type as string]} •{" "}
                    {r.end_date ? `${r.total_days} ימים • ` : ""}
                    {new Date(r.start_date).toLocaleDateString("en-GB")} –{" "}
                    {r.end_date ? new Date(r.end_date).toLocaleDateString("en-GB") : <span className="text-warning">טרם עודכן</span>}
                  </p>
                  {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                  {r.attachment_url && (
                    <a href={r.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Paperclip className="w-3 h-3" />
                        קובץ מצורף
                      </Button>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {r.status === "approved" && r.end_date && (isAdmin || isDirectManager || isHR || isPayroll) && (
                    <a
                      href={buildGoogleCalendarUrl({
                        title: `${r.employee?.full_name ?? "עובד"} בחופש`,
                        startDate: r.start_date,
                        endDate: r.end_date,
                        details: `${TYPE_LABELS[r.request_type] ?? r.request_type}${r.reason ? ` — ${r.reason}` : ""}`,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <CalendarPlus className="w-3 h-3" />
                        הוסף ליומן
                      </Button>
                    </a>
                  )}
                  {(
                    <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${
                      r.status === "approved" ? "bg-success/15 text-success" :
                      r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                      r.status === "pending" ? "bg-warning/15 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {STATUS_LABELS[r.status as string]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
