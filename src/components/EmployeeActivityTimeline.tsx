import { useMemo, useState } from "react";
import { UserPlus, Package, PackageOpen, Palmtree, Stethoscope, Activity, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEmployeeResourceHistory } from "@/hooks/useEmployeeResourceHistory";

type EventKind = "employment" | "asset" | "leave" | "other";

interface TimelineEvent {
  id: string;
  at: string;
  kind: EventKind;
  icon: any;
  title: string;
  detail?: string;
}

const FILTERS: { key: EventKind | "all"; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "employment", label: "העסקה" },
  { key: "asset", label: "ציוד ומשאבים" },
  { key: "leave", label: "חופשה ומחלה" },
  { key: "other", label: "פעולות מערכת" },
];

const leaveTypeLabels: Record<string, string> = {
  vacation: "חופשה",
  sick: "מחלה",
  reserve: "מילואים",
  personal: "יום אישי",
  other: "היעדרות",
};

const leaveStatusLabels: Record<string, string> = {
  pending: "ממתין לאישור",
  approved: "מאושר",
  rejected: "נדחה",
  cancelled: "בוטל",
};

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "—");

interface Props {
  employeeId: string;
  employee: any;
  activityLog?: any[];
  leaveRequests?: any[];
  handoverForms?: any[];
}

export function EmployeeActivityTimeline({
  employeeId,
  employee,
  activityLog,
  leaveRequests,
  handoverForms,
}: Props) {
  const [filter, setFilter] = useState<EventKind | "all">("all");
  const { data: resourceHistory } = useEmployeeResourceHistory(
    employeeId,
    (employee?.offboarding_snapshot as any)?.assets,
    employee?.access_revoked_at,
  );

  const events = useMemo<TimelineEvent[]>(() => {
    const out: TimelineEvent[] = [];

    // Employment milestones
    if (employee?.start_date) {
      out.push({
        id: "start",
        at: employee.start_date,
        kind: "employment",
        icon: UserPlus,
        title: "כניסה לתפקיד",
        detail: [employee.role, employee.department].filter(Boolean).join(" · "),
      });
    }
    if (employee?.end_date) {
      out.push({
        id: "end",
        at: employee.end_date,
        kind: "employment",
        icon: UserMinus,
        title: "סיום עבודה",
        detail: employee.access_revoked_at ? `הגישה נחסמה ב-${fmt(employee.access_revoked_at)}` : undefined,
      });
    }

    // Signed handover / return protocols
    for (const f of handoverForms ?? []) {
      const isReturn = f.direction === "return";
      const assetName = f.assets?.asset_name ?? "פריט";
      const assetCode = f.assets?.asset_code ? ` (${f.assets.asset_code})` : "";
      out.push({
        id: `hf-${f.id}`,
        at: f.signed_at ?? f.created_at,
        kind: "asset",
        icon: isReturn ? PackageOpen : Package,
        title: `${isReturn ? "הזדכות על" : "מסירת"} ${assetName}${assetCode}`,
        detail: "פרוטוקול חתום",
      });
    }

    // Asset assignment history (from resources log)
    const formAssetIds = new Set((handoverForms ?? []).map((f: any) => f.asset_id).filter(Boolean));
    for (const r of resourceHistory ?? []) {
      const label = [r.assetName, r.assetCode ? `(${r.assetCode})` : ""].filter(Boolean).join(" ");
      if (r.assignedAt && !(r.assetId && formAssetIds.has(r.assetId))) {
        out.push({
          id: `ra-${r.assetId ?? r.assetName}-${r.assignedAt}`,
          at: r.assignedAt,
          kind: "asset",
          icon: Package,
          title: `שיוך ${label}`,
          detail: r.category || undefined,
        });
      }
      if (r.releasedAt) {
        out.push({
          id: `rr-${r.assetId ?? r.assetName}-${r.releasedAt}`,
          at: r.releasedAt,
          kind: "asset",
          icon: PackageOpen,
          title: `החזרת ${label}`,
          detail: r.category || undefined,
        });
      }
    }

    // Leave & sick requests
    for (const l of leaveRequests ?? []) {
      const type = leaveTypeLabels[l.request_type] ?? "היעדרות";
      const range = l.end_date && l.end_date !== l.start_date
        ? `${fmt(l.start_date)} – ${fmt(l.end_date)}`
        : fmt(l.start_date);
      out.push({
        id: `lr-${l.id}`,
        at: l.start_date,
        kind: "leave",
        icon: l.request_type === "sick" ? Stethoscope : Palmtree,
        title: `${type}: ${range}`,
        detail: [
          l.total_days ? `${l.total_days} ימים` : null,
          leaveStatusLabels[l.status] ?? l.status,
        ].filter(Boolean).join(" · "),
      });
    }

    // Raw activity log
    for (const a of activityLog ?? []) {
      out.push({
        id: `al-${a.id}`,
        at: a.created_at,
        kind: "other",
        icon: Activity,
        title: a.action,
        detail: a.details ?? undefined,
      });
    }

    return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [employee, activityLog, leaveRequests, handoverForms, resourceHistory]);

  const shown = filter === "all" ? events : events.filter((e) => e.kind === filter);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card p-4 sm:p-6 animate-fade-in">
      <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label="סינון סוג אירוע">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted",
            )}
          >
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
      </div>

      {shown.length > 0 ? (
        <div className="relative">
          <div className="absolute top-0 bottom-0 right-[15px] w-0.5 bg-border" aria-hidden="true" />
          <ol className="space-y-5">
            {shown.map((e) => {
              const Icon = e.icon;
              return (
                <li key={e.id} className="flex items-start gap-4 relative">
                  <span className="z-10 shrink-0 w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center">
                    <Icon className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">{e.title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      <time className="text-xs text-muted-foreground">{fmt(e.at)}</time>
                      {e.detail && <span className="text-xs text-muted-foreground">{e.detail}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">אין אירועים להצגה</div>
      )}
    </div>
  );
}
