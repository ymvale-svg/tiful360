import { Clock, LogIn, LogOut, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WelcomeDateTime } from "@/components/portal/WelcomeDateTime";
import type { AttendancePunch } from "@/hooks/useAttendancePunches";

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

/** Today's punches, oldest first. */
export function todaysPunches(punches: AttendancePunch[], now = new Date()): AttendancePunch[] {
  const today = now.toDateString();
  return punches
    .filter((p) => new Date(p.punch_at).toDateString() === today)
    .sort((a, b) => a.punch_at.localeCompare(b.punch_at));
}

/**
 * First card on the portal home: the clock-in / clock-out action (one tap), or — for employees who
 * punch at a physical clock — today's status with a way into the attendance tab.
 */
export function PortalClockCard({
  punches, canRemotePunch, punchingDir, onPunch, onOpenAttendance,
}: {
  punches: AttendancePunch[];
  canRemotePunch: boolean;
  punchingDir: "in" | "out" | null;
  onPunch: (direction: "in" | "out") => void;
  onOpenAttendance: () => void;
}) {
  const today = todaysPunches(punches);
  const firstIn = today.find((p) => p.direction === "in");
  const last = today[today.length - 1];
  const lastOut = [...today].reverse().find((p) => p.direction === "out");
  const isIn = last?.direction === "in";

  const status = !last
    ? "עוד לא החתמת היום"
    : isIn
      ? `בעבודה מ-${hhmm(firstIn?.punch_at ?? last.punch_at)}`
      : `יצאת ב-${hhmm(lastOut!.punch_at)}`;

  return (
    <section aria-labelledby="portal-clock-title" className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id="portal-clock-title" className="font-bold">נוכחות היום</h2>
          <p className="text-sm text-muted-foreground" aria-live="polite">{status}</p>
        </div>
        <WelcomeDateTime />
      </div>

      {canRemotePunch ? (
        <>
          {/* The likely next action is the big filled button; the other stays available. */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-14 text-base gap-2"
              variant={isIn ? "outline" : "default"}
              disabled={punchingDir !== null}
              loading={punchingDir === "in"}
              loadingText="מאתר מיקום…"
              onClick={() => onPunch("in")}
            >
              <LogIn aria-hidden="true" />
              החתמת כניסה
            </Button>
            <Button
              className="h-14 text-base gap-2"
              variant={isIn ? "default" : "outline"}
              disabled={punchingDir !== null}
              loading={punchingDir === "out"}
              loadingText="מאתר מיקום…"
              onClick={() => onPunch("out")}
            >
              <LogOut aria-hidden="true" />
              החתמת יציאה
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">בלחיצה הראשונה הדפדפן יבקש אישור גישה למיקום.</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">ההחתמה נעשית בשעון הנוכחות במקום העבודה.</p>
          <Button variant="outline" className="min-h-11 gap-1" onClick={onOpenAttendance}>
            להחתמות שלי
            <ChevronLeft aria-hidden="true" />
          </Button>
        </div>
      )}
    </section>
  );
}
