import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock4, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/feedback/StatusChip";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

interface GapRow {
  employee_id: string;
  full_name: string;
  email: string | null;
  gap_date: string;
  gap_type: "empty" | "odd";
  punch_count: number;
  punch_times: string;
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function AttendanceMissingCard() {
  const { activeCompanyId } = useCompany();
  const date = todayIso();

  const { data: rows = [], isLoading, error, refetch } = useQuery<GapRow[]>({
    queryKey: ["attendance-gaps-today", activeCompanyId, date],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase.rpc("get_attendance_gaps" as any, {
        _company_id: activeCompanyId,
        _from: date,
        _to: date,
      });
      if (error) throw error;
      return (data ?? []) as GapRow[];
    },
    enabled: !!activeCompanyId,
  });

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Clock4 className="w-4 h-4 text-warning" aria-hidden="true" />
          חוסרי החתמה היום
        </h2>
        <Link to="/payroll" className="text-xs text-primary hover:underline">הכל</Link>
      </div>
      <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground" role="status">טוען...</div>
        ) : error ? (
          <div className="p-6 text-center text-sm" role="alert">
            <p className="font-medium">לא הצלחנו לטעון את חוסרי ההחתמה</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => { void refetch(); }}>נסו שוב</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            אין חוסרי החתמה היום
            <PartyPopper className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
        ) : (
          rows.slice(0, 8).map((r) => (
            <Link
              key={`${r.employee_id}-${r.gap_date}`}
              to={`/employees/${r.employee_id}`}
              className="p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {r.gap_type === "empty" ? "ללא החתמה" : `החתמה חלקית · ${r.punch_times}`}
                </p>
              </div>
              <StatusChip tone="warning" className="shrink-0">
                {r.gap_type === "empty" ? "חסר" : "חלקי"}
              </StatusChip>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
