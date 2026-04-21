import { FileText, Download, CheckCircle2, Clock, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  employeeId: string;
}

const STATUS: Record<string, { label: string; cls: string; icon: any }> = {
  pending: { label: "ממתין לחתימה", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400", icon: Clock },
  signed: { label: "נחתם", cls: "bg-success/15 text-success", icon: CheckCircle2 },
  sent: { label: "נשלח לשכר", cls: "bg-info/15 text-info", icon: Send },
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
        <FileText className="w-4 h-4 text-primary" />
        טפסי 101 ({forms.length})
      </h3>
      <div className="space-y-2">
        {forms.map((f) => {
          const st = STATUS[f.status] ?? STATUS.pending;
          const Icon = st.icon;
          return (
            <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">טופס 101 — שנת {f.tax_year}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${st.cls}`}>
                    <Icon className="w-3 h-3" />
                    {st.label}
                  </span>
                  {f.signed_at && (
                    <span>נחתם {new Date(f.signed_at).toLocaleDateString("he-IL")}</span>
                  )}
                </p>
              </div>
              {f.pdf_url && (
                <a
                  href={f.pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-lg hover:bg-muted text-primary"
                  title="הורד PDF"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
