import { useEffect, useId, useMemo, type ReactNode } from "react";
import { Check, Images, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Stepper } from "@/components/ui/stepper";

export type HandoverStep = "details" | "media" | "sign";

/** Progress through the protocol steps; the current step is announced, not only coloured. */
export function StepBar({ step, withMedia = true }: { step: HandoverStep; withMedia?: boolean }) {
  const steps: { key: HandoverStep; label: string }[] = [
    { key: "details", label: "פרטים" },
    ...(withMedia ? [{ key: "media" as HandoverStep, label: "תיעוד" }] : []),
    { key: "sign", label: "חתימות" },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return <Stepper steps={steps} current={idx} label="שלבי הפרוטוקול" className="py-1" />;
}

/** One option of a single-choice group: selection is exposed with aria-pressed and a check mark, not only the border colour. */
export function ModeButton({ active, onClick, icon, title }: { active: boolean; onClick: () => void; icon: ReactNode; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 p-2.5 rounded-lg border-2 text-sm flex items-center justify-center gap-2 transition-colors",
        active ? "border-primary bg-primary/5 text-primary font-medium" : "border-border hover:bg-muted",
      )}
    >
      {active ? <Check className="w-4 h-4" aria-hidden="true" /> : icon}
      {title}
    </button>
  );
}

/** A file input styled as a button; the input stays focusable (sr-only) so it works from the keyboard. */
export function FilePickerButton({
  icon, label, accept, capture, multiple, onFiles, className,
}: {
  icon: ReactNode;
  label: string;
  accept: string;
  capture?: "environment" | "user";
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  className?: string;
}) {
  const id = `file${useId()}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 items-center gap-2 px-3 py-2.5 bg-muted rounded-lg text-sm cursor-pointer hover:bg-muted/70 focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <input
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

/**
 * Two pickers side by side: the camera (capture) and the gallery / files. `capture` alone
 * forces the camera on phones and blocks choosing an existing photo.
 */
export function CaptureOrPick({
  icon, cameraLabel, galleryLabel = "בחירה מהגלריה", accept, multiple, onFiles,
}: {
  icon: ReactNode;
  cameraLabel: string;
  galleryLabel?: string;
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <FilePickerButton icon={icon} label={cameraLabel} accept={accept} capture="environment" multiple={multiple} onFiles={onFiles} />
      <FilePickerButton icon={<Images className="w-4 h-4" aria-hidden="true" />} label={galleryLabel} accept={accept} multiple={multiple} onFiles={onFiles} />
    </div>
  );
}

/** Photo previews with one object URL per file, revoked when the file is removed or the list unmounts. */
export function PhotoThumbs({ photos, onRemove }: { photos: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (!photos.length) return null;
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="תמונות שצורפו">
      {photos.map((p, i) => (
        <li key={`${p.name}-${p.lastModified}-${i}`} className="relative rounded-lg overflow-hidden border">
          <img src={urls[i]} alt={`תיעוד ${i + 1}`} className="w-full h-24 object-cover" />
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute top-1 left-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-background/90 shadow hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`הסר תמונה ${i + 1}`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
