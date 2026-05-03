import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlowState {
  lastPunchAt: string | null;
  countLast5Min: number;
  countLastHour: number;
  countToday: number;
  loading: boolean;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "אין נתונים";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "כרגע";
  if (min < 60) return `לפני ${min} דק'`;
  const h = Math.floor(min / 60);
  if (h < 24) return `לפני ${h} שעות`;
  return `לפני ${Math.floor(h / 24)} ימים`;
}

export function AttendanceFlowIndicator() {
  const { activeCompanyId } = useCompany();
  const [state, setState] = useState<FlowState>({
    lastPunchAt: null,
    countLast5Min: 0,
    countLastHour: 0,
    countToday: 0,
    loading: true,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());

  const refresh = async () => {
    if (!activeCompanyId) return;
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.rpc("get_attendance_flow_stats", {
        _company_id: activeCompanyId,
      });
      if (error) {
        console.error("flow stats error", error);
        return;
      }
      const row: any = Array.isArray(data) ? data[0] : data;
      setState({
        lastPunchAt: row?.last_punch_at ?? null,
        countLast5Min: Number(row?.count_5min ?? 0),
        countLastHour: Number(row?.count_hour ?? 0),
        countToday: Number(row?.count_today ?? 0),
        loading: false,
      });
      setLastRefreshAt(Date.now());
    } finally {
      // keep spin visible briefly even on fast responses
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000); // poll every 15s

    // realtime subscription
    if (!activeCompanyId) return () => clearInterval(interval);
    const channel = supabase
      .channel(`attendance-flow-${activeCompanyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "attendance_punches",
          filter: `company_id=eq.${activeCompanyId}`,
        },
        () => refresh(),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const ageMin = state.lastPunchAt
    ? Math.round((Date.now() - new Date(state.lastPunchAt).getTime()) / 60000)
    : null;

  let status: "live" | "idle" | "stale" | "down" = "down";
  let statusLabel = "אין נתונים היום";
  let statusColor = "bg-muted text-muted-foreground";
  let Icon = AlertTriangle;

  if (ageMin != null) {
    if (state.countLast5Min > 0) {
      status = "live";
      statusLabel = "זרימה פעילה";
      statusColor = "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
      Icon = Activity;
    } else if (ageMin <= 10) {
      status = "idle";
      statusLabel = "ממתין לפעימה";
      statusColor = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
      Icon = CheckCircle2;
    } else {
      status = "down";
      statusLabel = `אין שידור מהאגנט ${ageMin >= 60 ? `${Math.floor(ageMin / 60)}ש' ` : ""}${ageMin % 60} דק'`;
      statusColor = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/40";
      Icon = AlertTriangle;
    }
  }

  const showAlert = status === "down";

  return (
    <Card className={`border ${status === "live" ? "border-green-500/40" : status === "down" ? "border-amber-500/40" : ""}`} dir="rtl">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Icon className={`w-5 h-5 ${status === "live" ? "text-green-600 dark:text-green-400" : status === "down" ? "text-amber-600 dark:text-amber-400" : "text-blue-600 dark:text-blue-400"}`} />
              {status === "live" && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">סטטוס שעון נוכחות</span>
                <Badge variant="outline" className={statusColor}>{statusLabel}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                פעימה אחרונה {formatAgo(state.lastPunchAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <Stat label="ב-5 דק'" value={state.countLast5Min} highlight={state.countLast5Min > 0} />
            <Stat label="בשעה" value={state.countLastHour} />
            <Stat label="היום" value={state.countToday} />
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              disabled={isRefreshing || !activeCompanyId}
              className="h-8 px-2"
              title={`עודכן: ${new Date(lastRefreshAt).toLocaleTimeString("he-IL")}`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-bold text-base ${highlight ? "text-green-600 dark:text-green-400" : ""}`}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
