import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Tax101ValidationResult, Tax101Issue } from "@/lib/validateTax101";

interface Props {
  result: Tax101ValidationResult;
  /** Called when the user clicks "fix" on an issue. Receives the wizard step index. */
  onJumpToStep?: (step: number) => void;
}

const sectionLabels: Record<string, string> = {
  "ב": "ב. פרטי העובד/ת",
  "ג": "ג. ילדים",
  "ד": "ד. הכנסות",
  "ח": "ח. פטור / זיכוי",
  "ט": "ט. תיאום מס",
};

export function Tax101ValidationPanel({ result, onJumpToStep }: Props) {
  const { ok, errors, warnings } = result;

  if (ok && warnings.length === 0) {
    return (
      <div className="rounded-lg border border-success/40 bg-success/5 p-3 flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
        <div className="text-sm">
          <div className="font-semibold text-success">כל הבדיקות עברו</div>
          <div className="text-xs text-muted-foreground">
            הטופס תואם את דרישות 0101/130 וניתן ליצא PDF.
          </div>
        </div>
      </div>
    );
  }

  // Group by section for the official-form feel.
  const grouped = [...errors, ...warnings].reduce<Record<string, Tax101Issue[]>>((acc, i) => {
    (acc[i.section] ||= []).push(i);
    return acc;
  }, {});

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      ok ? "border-warning/40 bg-warning/5" : "border-destructive/40 bg-destructive/5",
    )}>
      <div className="flex items-start gap-2">
        {ok
          ? <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          : <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />}
        <div className="text-sm flex-1">
          <div className={cn("font-semibold", ok ? "text-warning-foreground" : "text-destructive")}>
            {ok
              ? `יש ${warnings.length} אזהרות לפני הפקת ה-PDF`
              : `נמצאו ${errors.length} שגיאות שמונעות את יצוא ה-PDF`}
            {ok && warnings.length > 0 ? "" : warnings.length > 0 ? `, ועוד ${warnings.length} אזהרות` : ""}
          </div>
          <div className="text-xs text-muted-foreground">
            {ok
              ? "ניתן להמשיך, אך מומלץ לבדוק את הסעיפים הבאים:"
              : "יש לתקן את הסעיפים המסומנים — הטופס לא יהיה קביל ברשות המסים."}
          </div>
        </div>
      </div>

      <div className="space-y-2 mt-1 max-h-56 overflow-y-auto pe-1">
        {Object.entries(grouped).map(([section, items]) => (
          <div key={section} className="rounded border border-border/60 bg-background/60 p-2">
            <div className="text-xs font-bold mb-1">{sectionLabels[section] ?? `סעיף ${section}`}</div>
            <ul className="space-y-1">
              {items.map((it, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs">
                  {it.level === "error"
                    ? <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />}
                  <span className="flex-1">{it.message}</span>
                  {onJumpToStep && (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => onJumpToStep(it.step)}
                    >
                      תקן
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
