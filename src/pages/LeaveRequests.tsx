import { useState, useMemo } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useTeamLeaveRequests } from "@/hooks/useLeaveRequests";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CalendarDays, Stethoscope, Paperclip, CalendarPlus, Clock, Archive, CheckCircle2, XCircle, Ban } from "lucide-react";
import { StateView } from "@/components/feedback/StateView";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { buildGoogleCalendarUrl } from "@/lib/googleCalendar";
import { exportToExcel } from "@/lib/exportExcel";

const TYPE_LABELS: Record<string, string> = { vacation: "חופשה", sick: "מחלה", reserve: "מילואים", personal: "יום אישי", other: "אחר" };
const STATUS_LABELS: Record<string, string> = { approved: "מאושר", rejected: "נדחה", cancelled: "בוטל", pending: "ממתין" };

export default function LeaveRequests() {
  const { isPayroll, isAdmin, isDirectManager, isHR } = useAuth();
  const { data: requests = [], isLoading, error, refetch } = useTeamLeaveRequests();
  const [query, setQuery] = useState("");

  const tabs = useMemo(() => {
    const byTab: Record<string, (r: any) => boolean> = {
      pending: (r) => r.status === "pending" && r.request_type !== "sick",
      approved: (r) => r.status === "approved" && r.request_type !== "sick",
      sick: (r) => r.request_type === "sick",
      archive: (r) => r.status === "rejected" || r.status === "cancelled",
    };
    return [
      { id: "pending", label: "ממתינות", icon: Clock, match: byTab.pending },
      { id: "approved", label: "חופשות מדווחות", icon: CalendarDays, match: byTab.approved },
      { id: "sick", label: "הצהרות מחלה", icon: Stethoscope, match: byTab.sick },
      { id: "archive", label: "ארכיון", icon: Archive, match: byTab.archive },
    ].map((t) => ({ ...t, count: requests.filter(t.match).length }));
  }, [requests]);

  // Until the user picks a tab, open on pending requests when there are any.
  const [chosenTab, setChosenTab] = useState<string | null>(null);
  const pendingCount = tabs[0].count;
  const tab = chosenTab ?? (pendingCount > 0 ? "pending" : "approved");
  const setTab = setChosenTab;
  const activeTab = tabs.find((t) => t.id === tab) ?? tabs[1];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r: any) => {
      if (!activeTab.match(r)) return false;
      if (!q) return true;
      return [r.employee?.full_name, r.employee?.department, r.reason, TYPE_LABELS[r.request_type]]
        .some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [requests, activeTab, query]);

  const onTabKey = (e: React.KeyboardEvent, idx: number) => {
    // RTL: ArrowLeft moves to the next tab, ArrowRight to the previous one.
    const step = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(idx + step + tabs.length) % tabs.length];
    setTab(next.id);
    document.getElementById(`leave-tab-${next.id}`)?.focus();
  };

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div role="tablist" aria-label="סוגי בקשות" className="flex items-center gap-2 flex-wrap">
          {tabs.map((t, idx) => (
            <button
              key={t.id}
              id={`leave-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls="leave-tabpanel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, idx)}
              className={`inline-flex items-center gap-1.5 min-h-10 px-4 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="w-4 h-4" aria-hidden="true" />
              {t.label}
              <span
                className={`min-w-5 px-1.5 rounded-full text-xs ${
                  tab === t.id ? "bg-primary-foreground/20" : t.id === "pending" && t.count > 0 ? "bg-warning/15 text-warning" : "bg-muted"
                }`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <SearchInput
          size="sm"
          wrapperClassName="sm:w-64 sm:mr-auto"
          label="חיפוש בקשות לפי עובד, מחלקה או סיבה"
          placeholder="חיפוש עובד, מחלקה או סיבה"
          value={query}
          onValueChange={setQuery}
        />
      </div>

      {tab === "sick" && (
        <p className="text-xs text-muted-foreground bg-info/10 border border-info/20 rounded-lg p-3">
          הצהרות מחלה נקלטות אוטומטית ונשלחות לידיעת המנהל הישיר וחשבות השכר.
        </p>
      )}

      <div id="leave-tabpanel" role="tabpanel" aria-labelledby={`leave-tab-${tab}`}>
      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        label="בקשות חופשה ומחלה"
        isEmpty={filtered.length === 0}
        empty={query.trim() ? {
          title: "לא נמצאו בקשות שתואמות לחיפוש",
          description: `אין ב"${activeTab.label}" בקשות עם "${query.trim()}".`,
          action: <Button size="sm" variant="outline" onClick={() => setQuery("")}>נקה חיפוש</Button>,
        } : {
          title: tab === "pending" ? "אין בקשות שממתינות לטיפול" : `אין בקשות ב"${activeTab.label}"`,
        }}
      >
        <div className="space-y-2">
          {filtered.map((r: any) => (
            <div
              key={r.id}
              className="bg-card rounded-xl border border-border/50 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-base">{r.employee?.full_name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {r.employee?.department} • {TYPE_LABELS[r.request_type as string]} •{" "}
                    {r.end_date ? `${r.total_days} ימים • ` : ""}
                    {new Date(r.start_date).toLocaleDateString("en-GB")} –{" "}
                    {r.end_date ? new Date(r.end_date).toLocaleDateString("en-GB") : <span className="text-warning">טרם עודכן</span>}
                  </p>
                  {r.reason && <p className="text-sm text-muted-foreground mt-1">{r.reason}</p>}
                  {r.attachment_url && (
                    <Button asChild variant="outline" size="sm" className="mt-2 text-sm gap-1">
                      <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                        <Paperclip className="w-3 h-3" aria-hidden="true" />
                        קובץ מצורף
                      </a>
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {r.status === "approved" && r.end_date && (isAdmin || isDirectManager || isHR || isPayroll) && (
                    <Button asChild variant="outline" size="sm" className="text-sm gap-1">
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
                      <CalendarPlus className="w-3 h-3" aria-hidden="true" />
                      הוסף ליומן
                    </a>
                    </Button>
                  )}
                  {(
                    <span className={`text-[0.8125rem] px-2 py-1 rounded-full font-medium ${
                      r.status === "approved" ? "bg-success/15 text-success" :
                      r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                      r.status === "pending" ? "bg-warning/15 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {r.status === "approved" ? <CheckCircle2 className="inline w-3.5 h-3.5 ml-1" aria-hidden="true" />
                        : r.status === "rejected" ? <XCircle className="inline w-3.5 h-3.5 ml-1" aria-hidden="true" />
                        : r.status === "pending" ? <Clock className="inline w-3.5 h-3.5 ml-1" aria-hidden="true" />
                        : <Ban className="inline w-3.5 h-3.5 ml-1" aria-hidden="true" />}
                      {STATUS_LABELS[r.status as string] ?? r.status}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </StateView>
      </div>
    </div>
  );
}
