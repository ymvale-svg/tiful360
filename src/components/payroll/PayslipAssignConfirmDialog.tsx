import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { useAssignPayslipToEmployee } from "@/hooks/usePayslips";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

export interface PendingPayslipAssign {
  payslip: {
    id: string;
    period_year?: number | null;
    period_month?: number | null;
    employee_name_detected?: string | null;
    id_number_detected?: string | null;
    extraction_status?: string | null;
  };
  employeeId: string;
  employeeName: string;
}

export function payslipLabel(p: PendingPayslipAssign["payslip"]): string {
  const period = p.period_month && p.period_year ? `${MONTHS[p.period_month - 1]} ${p.period_year}` : "";
  const who = p.employee_name_detected || (p.id_number_detected ? `ת.ז. ${p.id_number_detected}` : "");
  return [period, who && `(${who})`].filter(Boolean).join(" ") || "התלוש";
}

/**
 * Confirms a manual payslip assignment before it is saved, then offers a short
 * "ביטול" undo that restores the payslip to its previous unassigned state.
 */
export function PayslipAssignConfirmDialog({
  pending, onClose,
}: { pending: PendingPayslipAssign | null; onClose: () => void }) {
  const assign = useAssignPayslipToEmployee();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const undo = async (payslipId: string, employeeId: string, previousStatus: string) => {
    // Only revert while the payslip is still assigned to the same employee.
    const { data, error } = await supabase
      .from("payslips")
      .update({ employee_id: null, extraction_status: previousStatus })
      .eq("id", payslipId)
      .eq("employee_id", employeeId)
      .select("id");
    qc.invalidateQueries({ queryKey: ["payslips"] });
    qc.invalidateQueries({ queryKey: ["payslip-batches"] });
    if (error || !data?.length) {
      toast({ title: "לא ניתן היה לבטל את השיוך", description: error?.message, variant: "destructive" });
    } else {
      toast({ title: "השיוך בוטל" });
    }
  };

  const confirm = async () => {
    if (!pending) return;
    const { payslip, employeeId, employeeName } = pending;
    const previousStatus = payslip.extraction_status && payslip.extraction_status !== "success"
      ? payslip.extraction_status
      : "unmatched";
    setBusy(true);
    try {
      await assign.mutateAsync({ payslipId: payslip.id, employeeId });
      onClose();
      toast({
        title: "התלוש שויך בהצלחה",
        description: `${payslipLabel(payslip)} שויך ל-${employeeName}`,
        action: (
          <ToastAction altText="ביטול השיוך" onClick={() => undo(payslip.id, employeeId, previousStatus)}>
            ביטול
          </ToastAction>
        ),
      });
    } catch (e: any) {
      toast({ title: "שגיאה בשיוך התלוש", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={!!pending} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending && `לשייך את התלוש של ${payslipLabel(pending.payslip)} ל-${pending.employeeName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            אפשר לבטל את השיוך מההודעה שתופיע לאחר השמירה.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>ביטול</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "משייך..." : "שייך"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
