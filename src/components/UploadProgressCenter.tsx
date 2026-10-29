// Card layout adapted from "Progress Card" (kavikatiyar) and the time-left column of "File Upload
// Progress List" (sean0205) on 21st.dev: file-type icon, name, thin bar, bytes, percent, time left,
// and a cancel button that really stops the transfer.
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, CircleAlert, File, FileArchive, FileImage, FileSpreadsheet, FileText, FileVideo, ListChecks, X } from "lucide-react";
import { uploadJobs, type UploadJob } from "@/lib/uploadWithProgress";
import { fileKind, formatBytes, timeLeft, type FileKind } from "@/lib/uploadFormat";
import { cn } from "@/lib/utils";

const KIND: Record<FileKind, { icon: typeof File; tint: string }> = {
  pdf: { icon: FileText, tint: "bg-destructive/10 text-destructive" },
  image: { icon: FileImage, tint: "bg-info/10 text-info" },
  sheet: { icon: FileSpreadsheet, tint: "bg-success/10 text-success" },
  doc: { icon: FileText, tint: "bg-primary/10 text-primary" },
  archive: { icon: FileArchive, tint: "bg-warning/15 text-warning" },
  video: { icon: FileVideo, tint: "bg-info/10 text-info" },
  other: { icon: File, tint: "bg-muted text-muted-foreground" },
};

/** Re-renders once a second while something uploads, so the time-left estimate keeps moving. */
function useTicker(active: boolean) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function JobCard({ job }: { job: UploadJob }) {
  const isBatch = job.kind === "batch";
  const done = job.stage === "done";
  const failed = job.stage === "error";
  const running = !done && !failed;
  const pct = done ? 100 : Math.max(0, Math.min(100, job.percent));
  const { icon: KindIcon, tint } = isBatch ? { icon: ListChecks, tint: "bg-primary/10 text-primary" } : KIND[fileKind(job.name)];
  const Icon = done ? CheckCircle2 : failed ? CircleAlert : KindIcon;

  const sizeLine = isBatch
    ? job.detail
    : job.size
      ? done ? formatBytes(job.size) : `${formatBytes((job.size * pct) / 100)} מתוך ${formatBytes(job.size)}`
      : undefined;
  const status = failed
    ? job.error ?? "ההעלאה נכשלה"
    : done
      ? isBatch ? job.detail ?? "הושלם" : "הקובץ הועלה"
      : job.stage === "prepare"
        ? "מכין…"
        : isBatch ? `${pct}%` : timeLeft(pct, job.startedAt) ?? `${pct}%`;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-3 text-card-foreground shadow-lg",
        failed ? "border-destructive/40" : done ? "border-success/40" : "border-border",
      )}
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", done ? "bg-success/10 text-success" : failed ? "bg-destructive/10 text-destructive" : tint)} aria-hidden="true">
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={job.name}>{job.name}</p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label={`התקדמות ${job.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none",
              failed ? "bg-destructive" : done ? "bg-success" : "bg-primary",
              job.stage === "prepare" && "w-1/4 animate-pulse",
            )}
            style={job.stage === "prepare" ? undefined : { width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs tabular-nums">
          <span className={cn("truncate", failed ? "text-destructive" : done ? "text-success" : "text-muted-foreground")}>{status}</span>
          {sizeLine && !failed && <span className="shrink-0 text-muted-foreground" dir="ltr">{sizeLine}</span>}
        </div>
      </div>

      {running && job.cancel ? (
        <button
          type="button"
          onClick={job.cancel}
          className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          aria-label={`ביטול ההעלאה של ${job.name}`}
          title="ביטול ההעלאה"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : !running ? (
        <button
          type="button"
          onClick={() => uploadJobs.remove(job.id)}
          className="-m-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          aria-label="סגירה"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export function UploadProgressCenter() {
  const jobs = useSyncExternalStore(uploadJobs.subscribe, uploadJobs.get);
  const reduced = useReducedMotion();
  const running = jobs.filter((j) => j.stage !== "done" && j.stage !== "error");
  useTicker(running.length > 0);

  return (
    <div
      dir="rtl"
      className="fixed left-4 z-[100] w-80 max-w-[calc(100vw-2rem)]"
      style={{ bottom: "calc(1rem + var(--floating-bottom, 0px) + env(safe-area-inset-bottom, 0px))" }}
    >
      <span className="sr-only" role="status" aria-live="polite">
        {running.length > 1 ? `מעלה ${running.length} קבצים` : running.length === 1 ? `מעלה את ${running[0].name}` : ""}
      </span>
      {jobs.length > 1 && (
        <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground" aria-hidden="true">
          {running.length ? `מעלה ${running.length} מתוך ${jobs.length}` : `${jobs.length} הסתיימו`}
        </p>
      )}
      <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        <AnimatePresence initial={false}>
          {jobs.map((j) => (
            <motion.li
              key={j.id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <JobCard job={j} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
