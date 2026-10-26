import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2 } from "lucide-react";

/** דוח חודשי שנשלח לעובד — מציג בקשה לאשר את הדוח, ומאשר עם לחיצה. */
export function MonthReportConfirm({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
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
        <CheckCircle2 className="w-4 h-4 text-primary" />
        דוח הנוכחות לחודש {label} {report.status === "approved" ? "אושר סופית" : "אושר על ידך"}
      </div>
    );
  }
  const confirm = async () => {
    const { error } = await supabase.rpc("confirm_my_attendance_month" as any, { _month: report.month });
    if (error) return toast({ title: "שגיאה", description: error.message, variant: "destructive" });
    toast({ title: "תודה! הדוח אושר ונשלח לאחראי השכר" });
    qc.invalidateQueries({ queryKey: ["my-month-report", employeeId] });
  };
  return (
    <div className="bg-card rounded-xl border border-primary/40 p-3 space-y-2">
      <p className="text-sm font-medium">נשלח אליך דוח נוכחות לחודש {label}</p>
      <p className="text-xs text-muted-foreground">בדוק/י את הימים למטה, השלם/י חוסרים, ובסיום אשר/י את הדוח.</p>
      <Button size="sm" onClick={confirm}><CheckCircle2 className="w-4 h-4 ml-1" />אישרתי את הדוח</Button>
    </div>
  );
}
