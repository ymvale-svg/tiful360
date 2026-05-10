import { useState, useMemo } from "react";
import { useCompanyAttendanceCorrections, useReviewAttendanceCorrection } from "@/hooks/useAttendanceCorrections";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Clock4, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ExportExcelButton } from "@/components/ExcelActionButtons";
import { exportToExcel } from "@/lib/exportExcel";

const FILTERS = [
  { id: "pending", label: "ממתינות" },
  { id: "approved", label: "מאושרות" },
  { id: "rejected", label: "נדחו" },
  { id: "all", label: "הכל" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין", approved: "מאושר", rejected: "נדחה", cancelled: "בוטל",
};

export default function AttendanceCorrections() {
  const { isPayroll, isAdmin, isDirectManager } = useAuth();
  const { data: items = [], isLoading } = useCompanyAttendanceCorrections();
  const review = useReviewAttendanceCorrection();
  const { toast } = useToast();
  const [filter, setFilter] = useState(isPayroll && !isAdmin && !isDirectManager ? "approved" : "pending");
  const [reviewing, setReviewing] = useState<any | null>(null);
  const [note, setNote] = useState("");

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((r: any) => r.status === filter);
  }, [items, filter]);

  const canReview = isAdmin || isDirectManager;

  const handleReview = async (approve: boolean) => {
    if (!reviewing) return;
    try {
      await review.mutateAsync({ correction_id: reviewing.id, approve, manager_note: note });
      toast({ title: approve ? "התיקון אושר" : "התיקון נדחה" });
      setReviewing(null); setNote("");
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Clock4 className="w-5 h-5 text-primary" />
            תיקוני שעון נוכחות
          </h1>
          <p className="page-subtitle">
            {isPayroll && !canReview ? "תיקונים מאושרים לעיון" : "אישור בקשות תיקון של עובדים"}
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
                correction_date: new Date(r.correction_date).toLocaleDateString("en-GB").replace(/\//g, "-"),
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
        <p className="text-center text-sm text-muted-foreground py-8">אין בקשות להצגה</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => (
            <div key={r.id} className="bg-card rounded-xl border border-border/50 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm">{r.employee?.full_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.employee?.department} • תאריך תיקון: {new Date(r.correction_date).toLocaleDateString("en-GB").replace(/\//g, "-")}
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
                </div>
                {r.status === "pending" && canReview ? (
                  <Button size="sm" onClick={() => setReviewing(r)}>סקירה</Button>
                ) : (
                  <span className={`text-[11px] px-2 py-1 rounded-full font-medium ${
                    r.status === "approved" ? "bg-success/15 text-success" :
                    r.status === "rejected" ? "bg-destructive/15 text-destructive" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {STATUS_LABELS[r.status]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>סקירת בקשת תיקון</DialogTitle>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-3 text-sm">
              <p><strong>{reviewing.employee?.full_name}</strong> — {new Date(reviewing.correction_date).toLocaleDateString("en-GB").replace(/\//g, "-")}</p>
              <p className="text-muted-foreground">סיבה: {reviewing.reason || "—"}</p>
              <Textarea placeholder="הערה (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewing(null); setNote(""); }}>ביטול</Button>
            <Button variant="destructive" onClick={() => handleReview(false)} disabled={review.isPending}>
              <X className="w-4 h-4 ml-1" /> דחיה
            </Button>
            <Button onClick={() => handleReview(true)} disabled={review.isPending}>
              <Check className="w-4 h-4 ml-1" /> אישור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
