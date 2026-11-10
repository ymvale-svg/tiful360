import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip, TONE_SURFACE, TONE_TEXT, type StatusTone } from "@/components/feedback/StatusChip";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Wifi, WifiOff, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlowState {
  lastPunchAt: string | null;
  countLast5Min: number;
  countLastHour: number;
  countToday: number;
  loading: boolean;
}

interface AgentState {
  lastSeenAt: string | null;
  lastSuccessAt: string | null;
  clockReachable: boolean | null;
  clockIp: string | null;
  agentVersion: string | null;
  lastError: string | null;
}

const HEARTBEAT_STALE_SEC = 180; // 3 דקות ללא heartbeat = ניתוק agent

function formatAgo(iso: string | null): string {
  if (!iso) return "אין נתונים";
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `לפני ${sec} שנ'`;
  const min = Math.round(sec / 60);
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
  const [agent, setAgent] = useState<AgentState>({
    lastSeenAt: null,
    lastSuccessAt: null,
    clockReachable: null,
    clockIp: null,
    agentVersion: null,
    lastError: null,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number>(Date.now());

  const refresh = async () => {
    if (!activeCompanyId) return;
    setIsRefreshing(true);
    try {
      const [statsRes, agentRes] = await Promise.all([
        supabase.rpc("get_attendance_flow_stats", { _company_id: activeCompanyId }),
        supabase.rpc("get_attendance_agent_status", { _company_id: activeCompanyId }),
      ]);
      if (statsRes.error) console.error("flow stats error", statsRes.error);
      const row: any = Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data;
      setState({
        lastPunchAt: row?.last_punch_at ?? null,
        countLast5Min: Number(row?.count_5min ?? 0),
        countLastHour: Number(row?.count_hour ?? 0),
        countToday: Number(row?.count_today ?? 0),
        loading: false,
      });
      const a: any = Array.isArray(agentRes.data) ? agentRes.data[0] : agentRes.data;
      setAgent({
        lastSeenAt: a?.last_seen_at ?? null,
        lastSuccessAt: a?.last_success_at ?? null,
        clockReachable: a?.clock_reachable ?? null,
        clockIp: a?.clock_ip ?? null,
        agentVersion: a?.agent_version ?? null,
        lastError: a?.last_error ?? null,
      });
      setLastRefreshAt(Date.now());
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    if (!activeCompanyId) return () => clearInterval(interval);
    const channel = supabase
      .channel(`attendance-flow-${activeCompanyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "attendance_punches", filter: `company_id=eq.${activeCompanyId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId]);

  const hbAgeSec = agent.lastSeenAt
    ? Math.round((Date.now() - new Date(agent.lastSeenAt).getTime()) / 1000)
    : null;
  const agentAlive = hbAgeSec != null && hbAgeSec <= HEARTBEAT_STALE_SEC;

  // אבחון מצב המערכת:
  // 1. agent לא דיווח מעולם → לא מותקן/לא מוגדר
  // 2. agent לא דיווח מזמן → ניתוק agent
  // 3. agent חי אך השעון לא נגיש → תקלת רשת לשעון
  // 4. agent חי + שעון נגיש → תקין (גם אם אין החתמות)
  let status: "live" | "ok" | "no_clock" | "no_agent" | "never" = "never";
  let statusLabel = "agent לא הותקן";
  let tone: StatusTone = "neutral";
  let Icon: LucideIcon = AlertTriangle;
  let alertMsg: { title: string; body: string } | null = null;

  if (agent.lastSeenAt == null) {
    status = "never";
    statusLabel = "agent לא הותקן";
    tone = "neutral";
    Icon = WifiOff;
    alertMsg = {
      title: "ה-agent עדיין לא דיווח חיבור.",
      body: "התקן את שירות tiful360attendanceagent על המחשב המקומי וודא שהוא רץ.",
    };
  } else if (!agentAlive) {
    status = "no_agent";
    const min = Math.floor((hbAgeSec ?? 0) / 60);
    statusLabel = `agent מנותק ${min >= 60 ? `${Math.floor(min / 60)}ש' ` : ""}${min % 60} דק'`;
    tone = "critical";
    Icon = WifiOff;
    alertMsg = {
      title: "אין heartbeat מה-agent.",
      body: "בדוק שהשירות רץ במחשב המקומי (sc query tiful360attendanceagent), שהמחשב לא ב-sleep, ושיש לו אינטרנט.",
    };
  } else if (agent.clockReachable === false) {
    status = "no_clock";
    statusLabel = "השעון לא נגיש";
    tone = "warning";
    Icon = AlertTriangle;
    alertMsg = {
      title: `ה-agent חי אך לא מצליח להתחבר לשעון${agent.clockIp ? ` ${agent.clockIp}` : ""}.`,
      body: agent.lastError ?? "בדוק תקשורת רשת לשעון, כתובת IP, וכבל/חשמל לשעון.",
    };
  } else if (state.countLast5Min > 0) {
    status = "live";
    statusLabel = "זרימה פעילה";
    tone = "success";
    Icon = Activity;
  } else {
    status = "ok";
    statusLabel = "מחובר וממתין";
    tone = "info";
    Icon = CheckCircle2;
  }

  return (
    <Card className={`border ${status === "live" ? "border-success/40" : status === "no_agent" ? "border-destructive/40" : status === "no_clock" ? "border-warning/40" : ""}`} dir="rtl">
      <CardContent className="p-4">
        {alertMsg && (
          <div className={`mb-3 flex items-start gap-2 rounded-md border p-2.5 ${status === "no_clock" ? `${TONE_SURFACE.warning} ${TONE_TEXT.warning}` : `${TONE_SURFACE.critical} ${TONE_TEXT.critical}`}`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="text-xs leading-relaxed">
              <div className="font-semibold">{alertMsg.title}</div>
              <div className="opacity-80">{alertMsg.body}</div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Icon className={`w-5 h-5 ${status === "live" ? "text-success" : status === "no_agent" ? "text-destructive" : status === "no_clock" ? "text-warning" : "text-info"}`} aria-hidden="true" />
              {status === "live" && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">סטטוס שעון נוכחות</span>
                <StatusChip tone={tone} icon={Icon}>{statusLabel}</StatusChip>
                {agentAlive && agent.clockReachable === true && (
                  <StatusChip tone="success" icon={Wifi}>שעון מחובר</StatusChip>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 tabular-nums">
                <span>פעימה אחרונה: {formatAgo(state.lastPunchAt)}</span>
                <span>heartbeat: {formatAgo(agent.lastSeenAt)}</span>
                {agent.agentVersion && <span>ver {agent.agentVersion}</span>}
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
              aria-label="רענן סטטוס שעון נוכחות"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
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
      <div className={`font-bold text-base tabular-nums ${highlight ? "text-success-text" : ""}`}>{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
