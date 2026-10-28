import { useId, useState, type DragEvent, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropProps {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Main line, e.g. "גררו קובץ PDF לכאן או לחצו לבחירה". */
  title?: ReactNode;
  /** Second line, e.g. "עד 20MB". */
  hint?: ReactNode;
  id?: string;
  className?: string;
}

function matches(file: File, accept?: string) {
  if (!accept) return true;
  return accept.split(",").map((s) => s.trim().toLowerCase()).some((rule) =>
    rule.startsWith(".") ? file.name.toLowerCase().endsWith(rule)
      : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1))
      : file.type === rule);
}

/**
 * A drop zone that really accepts dropped files and works from the keyboard: the input stays in
 * the tab order (sr-only, not display:none) and the visible area is its label.
 */
export function FileDrop({ onFiles, accept, multiple, disabled, title, hint, id, className }: FileDropProps) {
  const auto = useId();
  const inputId = id ?? `drop${auto}`;
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);

  const take = (list: FileList | null) => {
    if (!list?.length) return;
    const all = Array.from(list);
    const ok = all.filter((f) => matches(f, accept));
    const picked = multiple ? ok : ok.slice(0, 1);
    setRejected(ok.length < all.length ? "חלק מהקבצים מסוג שאינו נתמך ולא נוספו" : null);
    if (picked.length) onFiles(picked);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };

  return (
    <div className={className}>
      <input
        id={inputId}
        type="file"
        className="peer sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => { take(e.target.files); e.target.value = ""; }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors",
          "hover:border-primary/50 hover:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
          over && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="h-6 w-6 text-primary" aria-hidden="true" />
        <span className="text-sm font-medium">{title ?? (multiple ? "גררו קבצים לכאן או לחצו לבחירה" : "גררו קובץ לכאן או לחצו לבחירה")}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      {rejected && <p role="alert" className="mt-1.5 text-xs text-destructive">{rejected}</p>}
    </div>
  );
}
