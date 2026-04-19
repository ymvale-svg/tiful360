import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download } from "lucide-react";

interface Props {
  employeeId: string;
}

export function HandoverFormsList({ employeeId }: Props) {
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
                {new Date(f.created_at).toLocaleDateString("he-IL")} •{" "}
                {f.status === "signed" ? "נחתם" : f.status === "pending" ? "ממתין לחתימה" : "בוטל"}
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
