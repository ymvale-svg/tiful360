import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";
import { useConfirm } from "@/components/feedback/ConfirmDialog";

/** דוח חודשי שנשלח לעובד — מציג בקשה לאשר את הדוח, ומאשר עם לחיצה. */
export function MonthReportConfirm({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const ask = useConfirm();
  const { data: report } = useQuery({
    queryKey: ["my-month-report", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance_month_reports" as any)
        .select("month, status").eq("employee_id", employeeId)
        .order("month", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  if (!report) return null;
  const label = String(report.month).split("-").reverse().join("/");
  if (report.status !== "sent") {
    return (
      <div className="flex items-center gap-2 text-xs bg-muted/40 rounded-lg px-3 py-2">
        <CheckCircle2 className="w-4 h-4 text-primary" aria-hidden="true" />
        דוח הנוכחות לחודש {label} {report.status === "approved" ? "אושר סופית" : "אושר על ידך"}
      </div>
    );
  }
  // The attestation can't be undone, so it is confirmed first; the RPC runs inside the dialog,
  // which keeps a spinner up and shows the error if it fails.
  const confirm = async () => {
    const ok = await ask({
      title: `לאשר את דוח הנוכחות לחודש ${label}?`,
      description: "אחרי האישור הדוח נשלח לאחראי השכר ולא תוכל/י לשנות אותו בעצמך. ודא/י שכל הימים מלאים ונכונים.",
      confirmLabel: "אישרתי, שלח את הדוח",
      cancelLabel: "עוד לא",
      onConfirm: async () => {
        const { error } = await supabase.rpc("confirm_my_attendance_month" as any, { _month: report.month });
        if (error) throw new Error(error.message);
      },
    });
    if (!ok) return;
    toast({ title: "תודה! הדוח אושר ונשלח לאחראי השכר" });
    qc.invalidateQueries({ queryKey: ["my-month-report", employeeId] });
  };
  return (
    <div className="bg-card rounded-xl border border-primary/40 p-3 space-y-2">
      <p className="text-sm font-medium">נשלח אליך דוח נוכחות לחודש {label}</p>
      <p className="text-xs text-muted-foreground">בדוק/י את הימים למטה, השלם/י חוסרים, ובסיום אשר/י את הדוח.</p>
      <Button onClick={confirm} className="min-h-11"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />אישור הדוח</Button>
    </div>
  );
}
