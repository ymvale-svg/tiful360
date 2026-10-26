import { useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadJobs, type UploadJob } from "@/lib/uploadWithProgress";

const STEPS = [
  { key: "prepare", label: "הכנה" },
  { key: "upload", label: "העלאה" },
  { key: "save", label: "שמירה" },
] as const;
const ORDER = { prepare: 0, upload: 1, save: 2, done: 3, error: -1 };

function Donut({ job }: { job: UploadJob }) {
  const r = 26, c = 2 * Math.PI * r;
  const pct = job.stage === "done" || job.stage === "error" ? 100 : job.percent;
  const color = job.stage === "error" ? "hsl(var(--destructive))" : "hsl(var(--success, 142 71% 40%))";
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .3s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
        {job.stage === "done" ? <Check className="w-6 h-6" style={{ color }} /> : job.stage === "error" ? <X className="w-6 h-6 text-destructive" /> : `${pct}%`}
      </div>
    </div>
  );
}

const statusText = (j: UploadJob) =>
  j.stage === "prepare" ? "מכין קובץ..." : j.stage === "upload" ? "מעלה קובץ..." : j.stage === "save" ? "שומר..." : j.stage === "done" ? "הקובץ נשמר בהצלחה" : j.error ?? "שגיאה בהעלאה";

export function UploadProgressCenter() {
  const jobs = useSyncExternalStore(uploadJobs.subscribe, uploadJobs.get);
  if (!jobs.length) return null;
  return (
    <div dir="rtl" className="fixed bottom-4 left-4 z-[100] w-80 space-y-2" role="status" aria-live="polite">
      {jobs.map((j) => (
        <div key={j.id} className="bg-card text-card-foreground border border-border rounded-xl shadow-lg p-3 flex gap-3 items-center">
          <Donut job={j} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={j.name}>{j.name}</p>
            <p className={`text-xs ${j.stage === "error" ? "text-destructive" : j.stage === "done" ? "text-[hsl(var(--success,142_71%_40%))]" : "text-muted-foreground"}`}>{statusText(j)}</p>
            {j.stage === "error" ? (
              <div className="flex gap-2 mt-2">
                {j.retry && <Button size="sm" variant="destructive" onClick={j.retry}>נסה שוב</Button>}
                <Button size="sm" variant="ghost" onClick={() => uploadJobs.remove(j.id)}>סגור</Button>
              </div>
            ) : (
              <div className="flex gap-2 mt-2 text-[10px] text-muted-foreground">
                {STEPS.map((s, i) => (
                  <span key={s.key} className={ORDER[j.stage] > i ? "font-semibold text-foreground" : ORDER[j.stage] === i ? "font-semibold text-primary" : ""}>
                    {ORDER[j.stage] > i ? "✓ " : ""}{s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
