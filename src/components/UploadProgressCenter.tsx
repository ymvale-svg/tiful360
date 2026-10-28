import { useSyncExternalStore } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadJobs, type UploadJob } from "@/lib/uploadWithProgress";

const STEPS = [
  { key: "prepare", label: "הכנה" },
  { key: "upload", label: "העלאה" },
] as const;
const ORDER = { prepare: 0, upload: 1, save: 2, done: 2, error: -1 };

const Donut = function Donut({ job }: { job: UploadJob }) {
  const r = 26, c = 2 * Math.PI * r;
  const pct = job.stage === "done" || job.stage === "error" ? 100 : job.percent;
  const color = job.stage === "error" ? "hsl(var(--destructive))" : "hsl(var(--success))";
  return (
    <div className="relative w-16 h-16 shrink-0">
      <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-300" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums">
        {job.stage === "done" ? <Check className="w-6 h-6" style={{ color }} aria-hidden="true" /> : job.stage === "error" ? <X className="w-6 h-6 text-destructive" aria-hidden="true" /> : `${pct}%`}
      </div>
    </div>
  );
}

const statusText = (j: UploadJob) => {
  if (j.stage === "error") return j.error ?? "שגיאה בהעלאה";
  if (j.kind === "batch") return j.detail ?? "מעבד…";
  // "done" means the bytes arrived; the screen that started the upload confirms the record itself.
  return j.stage === "prepare" ? "מכין קובץ..." : j.stage === "done" ? "הקובץ הועלה" : "מעלה קובץ...";
};

export function UploadProgressCenter() {
  const jobs = useSyncExternalStore(uploadJobs.subscribe, uploadJobs.get);
  if (!jobs.length) return null;
  return (
    <div dir="rtl" className="fixed left-4 z-[100] w-80 max-w-[calc(100vw-2rem)] space-y-2" role="status" aria-live="polite"
      style={{ bottom: "calc(1rem + var(--floating-bottom, 0px) + env(safe-area-inset-bottom, 0px))" }}>
      {jobs.map((j) => (
        <div key={j.id} className="bg-card text-card-foreground border border-border rounded-xl shadow-lg p-3 flex gap-3 items-center">
          <Donut job={j} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={j.name}>{j.name}</p>
            <p className={`text-xs ${j.stage === "error" ? "text-destructive" : j.stage === "done" ? "text-success" : "text-muted-foreground"}`}>{statusText(j)}</p>
            {j.stage === "error" || (j.kind === "batch" && j.stage === "done") ? (
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={() => uploadJobs.remove(j.id)}>סגור</Button>
              </div>
            ) : j.kind !== "batch" ? (
              <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                {STEPS.map((s, i) => (
                  <span key={s.key} className={ORDER[j.stage] > i ? "font-semibold text-foreground" : ORDER[j.stage] === i ? "font-semibold text-primary" : ""}>
                    {ORDER[j.stage] > i ? "✓ " : ""}{s.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
