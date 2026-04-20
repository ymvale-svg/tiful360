import { Button } from "@/components/ui/button";
import { Calendar, FileDown, Paperclip, X } from "lucide-react";
import { useCancelLeaveRequest } from "@/hooks/useLeaveRequests";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABELS: Record<string, string> = {
  vacation: "חופשה", sick: "מחלה", personal: "יום אישי", other: "אחר",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין", approved: "מאושר", rejected: "נדחה", cancelled: "בוטל",
};
const STATUS_CLASS: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const fmt = (d: string) => new Date(d).toLocaleDateString("he-IL");

interface Props {
  requests: any[];
  showEmployee?: boolean;
  allowCancel?: boolean;
}

export function LeaveRequestsList({ requests, showEmployee, allowCancel }: Props) {
  const cancel = useCancelLeaveRequest();
  const { toast } = useToast();

  if (!requests || requests.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-6">אין בקשות</p>;
  }

  return (
    <div className="space-y-2">
      {requests.map((r: any) => (
        <div key={r.id} className="bg-card rounded-xl border border-border/50 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {showEmployee && (
                <p className="text-sm font-semibold">{r.employee?.full_name}</p>
              )}
              <p className="text-sm">
                <span className="font-medium">{TYPE_LABELS[r.request_type]}</span>
                <span className="text-muted-foreground"> • {r.total_days} ימים</span>
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <Calendar className="w-3 h-3" />
                {r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)} – ${fmt(r.end_date)}`}
              </div>
            </div>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_CLASS[r.status]}`}>
              {STATUS_LABELS[r.status]}
            </span>
          </div>

          {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
          {r.manager_note && (
            <p className="text-xs bg-muted/50 rounded p-2">
              <strong>הערת מנהל:</strong> {r.manager_note}
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {r.attachment_url && (
              <a href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <Paperclip className="w-3 h-3" />
                  קובץ מצורף
                </Button>
              </a>
            )}
            {r.signed_pdf_url && (
              <a href={r.signed_pdf_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <FileDown className="w-3 h-3" />
                  טופס חתום
                </Button>
              </a>
            )}
            {allowCancel && r.status === "pending" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-destructive"
                onClick={async () => {
                  if (!confirm("לבטל את הבקשה?")) return;
                  try {
                    await cancel.mutateAsync(r.id);
                    toast({ title: "הבקשה בוטלה" });
                  } catch (e: any) {
                    toast({ title: "שגיאה", description: e.message, variant: "destructive" });
                  }
                }}
              >
                <X className="w-3 h-3" />
                בטל
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
