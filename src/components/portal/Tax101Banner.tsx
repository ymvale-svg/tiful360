import { useState } from "react";
import { FileText, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyPendingTax101 } from "@/hooks/useTax101";
import { Tax101Dialog } from "@/components/Tax101Dialog";

interface Props {
  employee: any;
  taxYear?: number;
}

export function Tax101Banner({ employee, taxYear }: Props) {
  const year = taxYear ?? new Date().getFullYear() + 1;
  const { data: pending } = useMyPendingTax101(employee?.id, year);
  const [open, setOpen] = useState(false);

  if (!pending) return null;

  return (
    <>
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-center gap-3 animate-fade-in">
        <div className="w-11 h-11 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-warning" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">טופס 101 לשנת {year} ממתין לחתימה</p>
          <p className="text-xs text-muted-foreground">מלא את הפרטים וחתום דיגיטלית — זה לוקח דקה</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1 shrink-0 min-h-11">
          מלא וחתום
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </Button>
      </div>

      {open && (
        <Tax101Dialog
          open={open}
          onOpenChange={setOpen}
          formId={pending.id}
          taxYear={pending.tax_year}
          employee={employee}
        />
      )}
    </>
  );
}
