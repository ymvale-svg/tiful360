import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download } from "lucide-react";
import { buildHandoverPdf } from "@/lib/pdf/buildHandoverPdf";
import type { HandoverFormData } from "@/lib/pdf/types";
import { useToast } from "@/hooks/use-toast";

interface Props {
  employeeId: string;
}

export function HandoverFormsList({ employeeId }: Props) {
  const { toast } = useToast();
  const { data: forms } = useQuery({
    queryKey: ["handover-forms", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("*")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!employeeId,
  });

  const downloadOnTheFly = async (f: any) => {
    try {
      const blob = await buildHandoverPdf(f.form_snapshot as HandoverFormData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `handover-${f.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "שגיאה בייצור PDF", description: e.message, variant: "destructive" });
    }
  };

  if (!forms || forms.length === 0) return null;

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4 text-primary" />
        טפסי קבלת ציוד ({forms.length})
      </h3>
      <div className="space-y-2">
        {forms.map((f: any) => (
          <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{f.form_snapshot?.asset_name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(f.created_at).toLocaleDateString("en-GB")} •{" "}
                {f.status === "signed" ? "נחתם" : f.status === "pending" ? "ממתין לחתימה" : "בוטל"}
              </p>
            </div>
            {f.pdf_url ? (
              <a
                href={f.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg hover:bg-muted text-primary"
                title="הורד PDF"
              >
                <Download className="w-4 h-4" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => downloadOnTheFly(f)}
                className="p-2 rounded-lg hover:bg-muted text-primary"
                title="הורד PDF"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
            {f.attached_document_url && (
              <a
                href={f.attached_document_url}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
                title="מסמך מצורף"
              >
                <FileText className="w-4 h-4" />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
