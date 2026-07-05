import { useState, useMemo } from "react";
import { useCompanyAttendanceCorrections } from "@/hooks/useAttendanceCorrections";
import { Clock4 } from "lucide-react";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";

const FILTERS = [
  { id: "approved", label: "מאושרות" },
  { id: "rejected", label: "נדחו" },
  { id: "all", label: "הכל" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין", approved: "מאושר", rejected: "נדחה", cancelled: "בוטל",
};

export default function AttendanceCorrections() {
  const { data: items = [], isLoading } = useCompanyAttendanceCorrections();
  const [filter, setFilter] = useState("approved");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((r: any) => r.status === filter);
  }, [items, filter]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Clock4 className="w-5 h-5 text-primary" />
            היסטוריית תיקוני שעון
          </h1>
          <p className="page-subtitle">
            תצוגת היסטוריה בלבד. תיקוני נוכחות מתבצעים כיום ישירות בטבלת ההחתמות.
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
                correction_date: new Date(r.correction_date).toLocaleDateString("en-GB"),
                original: `${r.original_check_in?.slice(0, 5) ?? "—"} – ${r.original_check_out?.slice(0, 5) ?? "—"}`,
                requested: `${r.requested_check_in?.slice(0, 5) ?? "—"} – ${r.requested_check_out?.slice(0, 5) ?? "—"}`,
                reason: r.reason ?? "",
                status: STATUS_LABELS[r.status] ?? r.status,
                manager_note: r.manager_note ?? "",
              })),
              [
                { key: "full_name", label: "שם עובד" },
                { key: "department", label: "מחלקה" },
                { key: "correction_date", label: "תאריך" },
                { key: "original", label: "מקורי" },
                { key: "requested", label: "מבוקש" },
                { key: "reason", label: "סיבה" },
                { key: "status", label: "סטטוס" },
                { key: "manager_note", label: "הערת מנהל" },
              ],
              "תיקוני_שעון"
            );
          }}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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
                ({items.filter((r: any) => r.status === f.id).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">אין רשומות להצגה</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => (
            <div key={r.id} className="bg-card rounded-xl border border-border/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.employee?.department} • תאריך תיקון: {new Date(r.correction_date).toLocaleDateString("en-GB")}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-x-6 text-xs">
                    <div className="text-muted-foreground">
                      מקורי: <span className="font-mono text-foreground">{r.original_check_in?.slice(0, 5) ?? "—"} – {r.original_check_out?.slice(0, 5) ?? "—"}</span>
                    </div>
                    <div className="text-muted-foreground">
                      מבוקש: <span className="font-mono text-foreground">{r.requested_check_in?.slice(0, 5) ?? "—"} – {r.requested_check_out?.slice(0, 5) ?? "—"}</span>
                    </div>
                  </div>
                  {r.reason && <p className="text-xs text-muted-foreground mt-2 italic">"{r.reason}"</p>}
                  {r.manager_note && <p className="text-xs mt-1">הערת מנהל: {r.manager_note}</p>}
                  {r.applied_at && (
                    <span className="inline-flex items-center mt-2 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      הוחל על השכר
                    </span>
                  )}
                </div>
                <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${
                  r.status === "approved" ? "bg-success/15 text-success" :
                  r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
