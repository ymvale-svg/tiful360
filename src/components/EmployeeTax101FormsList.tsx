import { FileText, Download, CheckCircle2, Clock, Send, type LucideIcon } from "lucide-react";
import { StatusChip, type StatusTone } from "@/components/feedback/StatusChip";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { openTax101Pdf } from "@/lib/tax101Url";

interface Props {
  employeeId: string;
}

const STATUS: Record<string, { label: string; tone: StatusTone; icon: LucideIcon }> = {
  pending: { label: "ממתין לחתימה", tone: "warning", icon: Clock },
  signed: { label: "נחתם", tone: "success", icon: CheckCircle2 },
  sent: { label: "נשלח לשכר", tone: "info", icon: Send },
};

export function EmployeeTax101FormsList({ employeeId }: Props) {
  const { data: forms = [] } = useQuery({
    queryKey: ["tax101", "by-employee", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_form_101" as any)
        .select("*")
        .eq("employee_id", employeeId)
        .order("tax_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!employeeId,
  });

  if (forms.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
        טפסי 101 ({forms.length})
      </h3>
      <div className="space-y-2">
        {forms.map((f) => {
          const st = STATUS[f.status] ?? STATUS.pending;
          return (
            <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">טופס 101 — שנת {f.tax_year}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <StatusChip tone={st.tone} icon={st.icon}>
                    {st.label}
                  </StatusChip>
                  {f.signed_at && (
                    <span>נחתם {new Date(f.signed_at).toLocaleDateString("en-GB")}</span>
                  )}
                </p>
              </div>
              {f.pdf_url && (
                <button
                  type="button"
                  onClick={() => openTax101Pdf(f.pdf_url)}
                  className="p-2 rounded-lg hover:bg-muted text-primary"
                  title="הורד PDF"
                  aria-label="הורד PDF"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
