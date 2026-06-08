import { FileText, Download, CheckCircle2, Clock } from "lucide-react";
import { useMyTax101Forms } from "@/hooks/useTax101";
import { openTax101Pdf } from "@/lib/tax101Url";

export function MyTax101FormsList({ employeeId }: { employeeId: string | undefined | null }) {
  const { data: forms = [] } = useMyTax101Forms(employeeId);

  if (!employeeId) return null;
  if (forms.length === 0) {
    return <p className="text-center text-xs text-muted-foreground py-3">אין טפסים שמורים</p>;
  }

  return (
    <div className="space-y-2">
      {(forms as any[]).map((f) => {
        const isSigned = f.status !== "pending";
        return (
          <div key={f.id} className="bg-muted/40 rounded-lg p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isSigned ? "bg-success/15" : "bg-amber-100 dark:bg-amber-950/40"}`}>
              {isSigned ? <CheckCircle2 className="w-4 h-4 text-success" /> : <Clock className="w-4 h-4 text-amber-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">טופס 101 — שנת {f.tax_year}</p>
              <p className="text-[11px] text-muted-foreground">
                {isSigned ? `נחתם ${f.signed_at ? new Date(f.signed_at).toLocaleDateString("en-GB") : ""}` : "ממתין לחתימה"}
              </p>
            </div>
            {f.pdf_url && (
              <button
                type="button"
                onClick={() => openTax101Pdf(f.pdf_url)}
                className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                הורד
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
