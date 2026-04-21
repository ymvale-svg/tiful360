import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateTax101BatchDialog } from "./CreateTax101BatchDialog";
import { useCompanyTax101Forms, useSendTax101Invite, useDeleteTax101 } from "@/hooks/useTax101";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Mail, Download, Trash2, Loader2, Filter } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתין לחתימה", cls: "bg-muted text-muted-foreground" },
  signed: { label: "נחתם", cls: "bg-success/15 text-success" },
  sent: { label: "נשלח לשכר", cls: "bg-info/15 text-info" },
};

export function Tax101AdminTab() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState<string>(String(currentYear + 1));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: forms = [], isLoading } = useCompanyTax101Forms(
    yearFilter === "all" ? undefined : Number(yearFilter)
  );
  const sendInvite = useSendTax101Invite();
  const del = useDeleteTax101();

  const years = useMemo(() => {
    const set = new Set<number>([currentYear, currentYear + 1]);
    (forms as any[]).forEach((f) => set.add(f.tax_year));
    return Array.from(set).sort((a, b) => b - a);
  }, [forms, currentYear]);

  const filtered = (forms as any[]).filter((f) => {
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const name = f.employee?.full_name?.toLowerCase() ?? "";
      const code = f.employee?.employee_code?.toLowerCase() ?? "";
      if (!name.includes(s) && !code.includes(s)) return false;
    }
    return true;
  });

  const handleResend = async (formId: string) => {
    try {
      await sendInvite.mutateAsync(formId);
      toast({ title: "תזכורת נשלחה במייל" });
    } catch (e: any) {
      toast({ title: "שגיאה בשליחה", description: e.message, variant: "destructive" });
    }
  };

  if (!activeCompanyId) {
    return <div className="text-center py-8 text-muted-foreground">לא נבחרה חברה</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">טופסי 101 לעובדים</h3>
              <p className="text-xs text-muted-foreground">פתח טופס לעובדים, עקוב אחרי החתימות והשליחה למחלקת השכר</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            פתח טופס 101 לחתימה
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <div className="p-3 border-b border-border/50 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span>סינון:</span>
          </div>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-8 px-2 rounded-md bg-muted text-sm border border-border"
          >
            <option value="all">כל השנים</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-2 rounded-md bg-muted text-sm border border-border"
          >
            <option value="all">כל הסטטוסים</option>
            <option value="pending">ממתין</option>
            <option value="signed">נחתם</option>
            <option value="sent">נשלח לשכר</option>
          </select>
          <Input
            placeholder="חיפוש עובד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-xs text-sm"
          />
        </div>

        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            אין טפסים. לחץ "פתח טופס 101 לחתימה" כדי להתחיל.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>עובד</th>
                <th>שנה</th>
                <th>סטטוס</th>
                <th>תאריך פתיחה</th>
                <th>תאריך חתימה</th>
                <th className="text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f: any) => {
                const st = STATUS_LABEL[f.status] ?? STATUS_LABEL.pending;
                return (
                  <tr key={f.id}>
                    <td>
                      <p className="font-medium">{f.employee?.full_name ?? "—"}</p>
                      <p className="text-[11px] text-muted-foreground">{f.employee?.employee_code}</p>
                    </td>
                    <td className="font-mono">{f.tax_year}</td>
                    <td>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString("he-IL")}</td>
                    <td className="text-xs text-muted-foreground">
                      {f.signed_at ? new Date(f.signed_at).toLocaleDateString("he-IL") : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        {f.status === "pending" && f.employee?.email && (
                          <Button
                            size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                            onClick={() => handleResend(f.id)}
                            disabled={sendInvite.isPending}
                          >
                            <Mail className="w-3 h-3" />
                            תזכורת
                          </Button>
                        )}
                        {f.pdf_url && (
                          <a href={f.pdf_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs">
                              <Download className="w-3 h-3" />
                              הורד
                            </Button>
                          </a>
                        )}
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setDeleteTarget(f)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateTax101BatchDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת טופס 101</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את הטופס של {deleteTarget?.employee?.full_name} לשנת {deleteTarget?.tax_year}?
              פעולה זו אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (deleteTarget) {
                  await del.mutateAsync(deleteTarget.id);
                  toast({ title: "הטופס נמחק" });
                  setDeleteTarget(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
