import { useState } from "react";
import { Building2, Plus, Pencil, Trash2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubEmployers, useDeleteSubEmployer, useSubEmployerEmployeeCounts, SubEmployer } from "@/hooks/useSubEmployers";
import { AddSubEmployerDialog } from "./AddSubEmployerDialog";
import { EditSubEmployerDialog } from "./EditSubEmployerDialog";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SubEmployersTab() {
  const { data: subEmployers = [], isLoading } = useSubEmployers();
  const { data: counts = {} } = useSubEmployerEmployeeCounts();
  const del = useDeleteSubEmployer();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SubEmployer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubEmployer | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      toast({ title: "תת-החברה נמחקה" });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "שגיאה במחיקה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold">מעסיקים / תת-חברות</h3>
              <p className="text-xs text-muted-foreground">
                לעובדים המועסקים תחת ישות משפטית שונה — טופס 101 ייצא עם פרטי המעסיק שיוגדר כאן
              </p>
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            הוסף תת-חברה
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : subEmployers.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            אין תת-חברות מוגדרות. לחץ "הוסף תת-חברה" כדי להתחיל.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>שם משפטי</th>
                <th>ח.פ. / עוסק</th>
                <th>איש קשר</th>
                <th>טלפון</th>
                <th>עובדים משויכים</th>
                <th>סטטוס</th>
                <th className="text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {subEmployers.map((s) => {
                const employeeCount = counts[s.id] ?? 0;
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.legal_name}</td>
                    <td className="font-mono text-sm" dir="ltr">{s.tax_id}</td>
                    <td className="text-sm">{s.contact_name || "—"}</td>
                    <td className="text-sm" dir="ltr">{s.phone || "—"}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        {employeeCount}
                      </span>
                    </td>
                    <td>
                      {s.is_active ? (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20">פעיל</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground">ארכיון</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTarget(s)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => setDeleteTarget(s)}
                          disabled={employeeCount > 0}
                          title={employeeCount > 0 ? `${employeeCount} עובדים משויכים — לא ניתן למחוק` : "מחק"}
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

      <AddSubEmployerDialog open={addOpen} onOpenChange={setAddOpen} />
      <EditSubEmployerDialog open={!!editTarget} onOpenChange={(v) => !v && setEditTarget(null)} subEmployer={editTarget} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תת-חברה</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את "{deleteTarget?.legal_name}"? פעולה זו אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
