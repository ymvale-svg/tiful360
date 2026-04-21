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
      <div className="rounded-xl border border-amber-300/60 dark:border-amber-700/60 bg-gradient-to-l from-amber-50 to-yellow-50 dark:from-amber-950/40 dark:to-yellow-950/30 p-4 flex items-center gap-3 animate-fade-in">
        <div className="w-11 h-11 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">טופס 101 לשנת {year} ממתין לחתימה</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80">מלא את הפרטים וחתום דיגיטלית — זה לוקח דקה</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1 shrink-0 bg-amber-600 hover:bg-amber-700 text-white">
          מלא וחתום
          <ChevronLeft className="w-3.5 h-3.5" />
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
