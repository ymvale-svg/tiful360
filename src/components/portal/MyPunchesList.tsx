import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, ArrowLeft, Pencil, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const highlightKey = highlightDate
    ? (() => { const [y, m, d] = highlightDate.split("-"); return `${d}/${m}/${y}`; })()
    : undefined;

  useEffect(() => {
    if (highlightKey && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightKey]);

  const remaining = Math.max(0, 3 - selfEditCount);

  const save = async (id: string, iso: string, newTime: string) => {
    const d = new Date(iso);
    const [h, m] = newTime.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    try {
      await edit.mutateAsync({ id, newPunchAt: d.toISOString() });
      toast({ title: "נשמר", description: "השעה עודכנה מיידית" });
    } catch (e: any) {
      toast({ title: "לא ניתן לתקן", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>
          לחץ על השעה לעריכה. תיקון אפשרי עד יום למחרת, ולאחר מכן{" "}
          <span className="font-semibold text-foreground">{remaining}</span> תיקונים נותרים החודש.
        </span>
      </div>

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
        const isHighlighted = day === highlightKey;
        const missingIn = !firstIn;
        const missingOut = !lastOut;
        const hasMissing = missingIn || missingOut;

        return (
          <div
            key={day}
            ref={isHighlighted ? highlightRef : undefined}
            className={cn(
              "bg-card rounded-xl border p-3 transition-all",
              isHighlighted && "border-primary ring-2 ring-primary/30 shadow-sm",
              !isHighlighted && hasMissing && "border-amber-500/40",
              !isHighlighted && !hasMissing && "border-border/50",
            )}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-semibold">{day}</span>
              <div className="flex items-center gap-1.5">
                {hasMissing && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300">
                    חסרה החתמה
                  </span>
                )}
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full font-medium",
                  isRemote ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary",
                )}>
                  {isRemote ? "מרחוק" : "שעון"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <PunchSlot
                icon={<ArrowRight className="w-3.5 h-3.5" />}
                label="כניסה"
                punch={firstIn}
                accent="emerald"
                onSave={save}
                pending={edit.isPending}
              />
              <PunchSlot
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
                label="יציאה"
                punch={lastOut}
                accent="rose"
                onSave={save}
                pending={edit.isPending}
              />
            </div>

            <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-t border-border/50 pt-2">
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Clock className="w-3 h-3" /> {hours} שעות
              </span>
              <span>({sorted.length} פעימות)</span>
              {sorted.some((p: any) => p.edited_at) && (
                <span className="inline-flex items-center gap-1 text-primary" title="נערך ידנית">
                  <Pencil className="w-2.5 h-2.5" /> נערך
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PunchSlot({
  icon,
  label,
  punch,
  accent,
  onSave,
  pending,
}: {
  icon: React.ReactNode;
  label: string;
  punch: AttendancePunch | undefined;
  accent: "emerald" | "rose";
  onSave: (id: string, iso: string, newTime: string) => Promise<void>;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const timeStr = punch
    ? new Date(punch.punch_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
    : "";
  const [val, setVal] = useState(timeStr);

  const accentClasses = accent === "emerald"
    ? { chip: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-600 dark:text-emerald-400" }
    : { chip: "bg-rose-500/10 border-rose-500/30", text: "text-rose-700 dark:text-rose-300", icon: "text-rose-600 dark:text-rose-400" };

  const startEdit = () => {
    setVal(timeStr || "09:00");
    setEditing(true);
  };
  const cancel = () => { setEditing(false); setVal(timeStr); };
  const submit = async () => {
    if (!punch || !val || val === timeStr) { setEditing(false); return; }
    await onSave(punch.id, punch.punch_at, val);
    setEditing(false);
  };

  return (
    <div className={cn(
      "rounded-lg border px-2.5 py-2 flex items-center gap-2 min-w-0",
      punch ? accentClasses.chip : "bg-muted/30 border-dashed border-border",
    )}>
      <span className={cn("shrink-0", punch ? accentClasses.icon : "text-muted-foreground")}>{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground leading-none mb-1">{label}</div>
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              type="time"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") cancel();
              }}
              className="h-7 px-1.5 text-xs font-mono w-[92px]"
            />
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={submit} disabled={pending} aria-label="שמור">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancel} aria-label="ביטול">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : punch ? (
          <button
            type="button"
            onClick={startEdit}
            className={cn(
              "group inline-flex items-center gap-1 font-mono font-semibold text-sm hover:underline underline-offset-2",
              accentClasses.text,
            )}
            title="לחץ לעריכה"
          >
            {timeStr}
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
          </button>
        ) : (
          <span className="font-mono text-sm text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
