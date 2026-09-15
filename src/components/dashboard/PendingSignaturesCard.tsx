import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PenLine, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateDMY } from "@/lib/utils";
import { snapshotItemLabel } from "@/lib/pdf/formPdf";

interface PendingFormRow {
  id: string;
  employee_id: string;
  asset_id: string | null;
  direction: string;
  created_at: string;
  form_snapshot: any;
  assets?: { asset_name: string | null; asset_code: string | null } | null;
  employees?: { full_name: string | null } | null;
}

/** Handover/return protocols that were sent for remote signing and still await the employee's signature. */
export function PendingSignaturesCard() {
  const { data: forms, isLoading } = useQuery({
    queryKey: ["pending-signature-forms"],
    queryFn: async (): Promise<PendingFormRow[]> => {
      const { data, error } = await supabase
        .from("asset_handover_forms")
        .select("id, employee_id, asset_id, direction, created_at, form_snapshot, assets(asset_name, asset_code), employees(full_name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const rows = forms ?? [];

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="font-semibold">טפסים ממתינים לחתימה מרחוק</h2>
        </div>
        <Link to="/assets" className="text-xs text-primary hover:underline flex items-center gap-0.5">
          למשאבים
          <ChevronLeft className="w-3 h-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="divide-y divide-border/50">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground text-sm">טוען טפסים...</div>
        )}
        {!isLoading && rows.length === 0 && (
          <div className="p-6 text-center text-muted-foreground text-sm">אין טפסים ממתינים לחתימה</div>
        )}
        {rows.map((form) => {
          const label = form.assets?.asset_name
            ? `${form.assets.asset_name}${form.assets.asset_code ? ` (${form.assets.asset_code})` : ""}`
            : snapshotItemLabel(form.form_snapshot);
          const waitingDays = Math.floor(
            (Date.now() - new Date(form.created_at).getTime()) / (1000 * 60 * 60 * 24),
          );
          return (
            <Link
              key={form.id}
              to={`/employees/${form.employee_id}`}
              className="block p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{label.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {form.employees?.full_name ?? "—"}
                    {" • "}
                    {form.direction === "return" ? "החזרה" : "מסירה"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-warning/15 text-warning-foreground border-warning/40">
                    ממתין לחתימה
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    נשלח {formatDateDMY(form.created_at)}
                    {waitingDays >= 3 ? ` • ${waitingDays} ימים` : ""}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
