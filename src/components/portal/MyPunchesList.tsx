import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { useEditOwnPunchTime, useMySelfEditCount, type AttendancePunch } from "@/hooks/useAttendancePunches";
import { useToast } from "@/hooks/use-toast";

function calcHours(inTime: string, outTime: string): string {
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  const mins = (oh * 60 + om) - (ih * 60 + im);
  if (mins <= 0) return "—";
  return (mins / 60).toFixed(1);
}

interface Props {
  punches: AttendancePunch[];
  /** YYYY-MM-DD — scrolls to and highlights that day (e.g. from missing-punches email link) */
  highlightDate?: string;
}

export function MyPunchesList({ punches, highlightDate }: Props) {
  const { data: selfEditCount = 0 } = useMySelfEditCount();
  const edit = useEditOwnPunchTime();
  const { toast } = useToast();
  const highlightRef = useRef<HTMLDivElement | null>(null);

  const byDay = new Map<string, AttendancePunch[]>();
  for (const p of punches) {
    const day = new Date(p.punch_at).toLocaleDateString("en-GB");
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }

  // Convert YYYY-MM-DD → DD/MM/YYYY to match the map keys
  const highlightKey = highlightDate
    ? (() => { const [y, m, d] = highlightDate.split("-"); return `${d}/${m}/${y}`; })()
    : undefined;

  useEffect(() => {
    if (highlightKey && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightKey]);

  const save = async (id: string, iso: string, newTime: string) => {
    const d = new Date(iso);
    const [h, m] = newTime.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    try {
      await edit.mutateAsync({ id, newPunchAt: d.toISOString() });
      toast({ title: "השעה עודכנה" });
    } catch (e: any) {
      toast({ title: "לא ניתן לתקן", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      {selfEditCount > 0 && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          ניצלת {selfEditCount} מתוך 3 תיקוני נוכחות עצמיים החודש.
        </p>
      )}

      {Array.from(byDay.entries()).map(([day, items]) => {
        const sorted = [...items].sort((a, b) => a.punch_at.localeCompare(b.punch_at));
        const ins = sorted.filter((p) => p.direction === "in");
        const outs = sorted.filter((p) => p.direction === "out");
        const firstIn = ins[0];
        const lastOut = outs[outs.length - 1];
        const hours = firstIn && lastOut
          ? calcHours(
              new Date(firstIn.punch_at).toTimeString().slice(0, 5),
              new Date(lastOut.punch_at).toTimeString().slice(0, 5),
            )
          : "—";
        const isRemote = sorted.some((p) => p.source === "portal_remote");
        return (
          <div key={day} className="bg-card rounded-xl border border-border/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">{day}</span>
              <span className={cn(
                "text-[11px] px-2 py-0.5 rounded-full font-medium",
                isRemote ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary"
              )}>
                {isRemote ? "מרחוק 🖊️" : "שעון"}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span>
                כניסה: {firstIn ? (
                  <EditableTime punch={firstIn} colorClass="text-emerald-600 dark:text-emerald-400" onSave={save} />
                ) : <span className="font-mono">—</span>}
              </span>
              <span>
                יציאה: {lastOut ? (
                  <EditableTime punch={lastOut} colorClass="text-rose-600 dark:text-rose-400" onSave={save} />
                ) : <span className="font-mono">—</span>}
              </span>
              <span className="font-semibold text-foreground">{hours} שעות</span>
              <span className="text-[10px]">({sorted.length} פעימות)</span>
              {sorted.some((p: any) => p.edited_at) && (
                <span className="text-[10px] text-primary" title="נערך ידנית">✎ נערך</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EditableTime({
  punch,
  colorClass,
  onSave,
}: {
  punch: AttendancePunch;
  colorClass: string;
  onSave: (id: string, iso: string, newTime: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const timeStr = new Date(punch.punch_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const [val, setVal] = useState(timeStr);

  if (editing) {
    return (
      <input
        type="time"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => { setEditing(false); if (val !== timeStr) onSave(punch.id, punch.punch_at, val); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setEditing(false); if (val !== timeStr) onSave(punch.id, punch.punch_at, val); }
          if (e.key === "Escape") { setEditing(false); setVal(timeStr); }
        }}
        className={cn("font-mono font-semibold bg-transparent border-b border-current outline-none w-16", colorClass)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setVal(timeStr); setEditing(true); }}
      className={cn("font-mono font-semibold hover:underline", colorClass)}
      title="לחץ לעריכה"
    >
      {timeStr}
    </button>
  );
}
