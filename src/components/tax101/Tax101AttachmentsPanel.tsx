import { useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Paperclip, X } from "lucide-react";
import { FileDrop } from "@/components/feedback/FileDrop";
import { IconButton } from "@/components/feedback/IconButton";
import { undoToast } from "@/components/feedback/undoToast";
import { useToast } from "@/hooks/use-toast";
import { uploadFile } from "@/lib/uploadWithProgress";
import {
  attachmentPath,
  TAX101_ATTACHMENT_ACCEPT,
  TAX101_ATTACHMENT_MAX_BYTES,
  TAX101_ATTACHMENT_MAX_FILES,
  type AttachmentRequirement,
  type Tax101Attachment,
  type Tax101AttachmentKind,
} from "@/lib/tax101/attachments";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string;
  formId: string;
  requirements: AttachmentRequirement[];
  files: Tax101Attachment[];
  onChange: (update: (files: Tax101Attachment[]) => Tax101Attachment[]) => void;
  disabled?: boolean;
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

/** "נספחים" under the form: one row per document the form asks for, each with its own drop zone. */
export function Tax101AttachmentsPanel({ companyId, formId, requirements, files, onChange, disabled }: Props) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<Tax101AttachmentKind | null>(null);

  const upload = async (kind: Tax101AttachmentKind, picked: File[]) => {
    const room = TAX101_ATTACHMENT_MAX_FILES - files.length;
    if (room <= 0) {
      toast({ title: `אפשר לצרף עד ${TAX101_ATTACHMENT_MAX_FILES} קבצים`, variant: "destructive" });
      return;
    }
    const tooBig = picked.filter((f) => f.size > TAX101_ATTACHMENT_MAX_BYTES);
    if (tooBig.length) {
      toast({ title: "קובץ גדול מדי", description: `${tooBig.map((f) => f.name).join(", ")} — עד 10MB לקובץ`, variant: "destructive" });
    }
    const ok = picked.filter((f) => f.size <= TAX101_ATTACHMENT_MAX_BYTES).slice(0, room);
    if (!ok.length) return;

    setUploading(kind);
    try {
      for (const [i, file] of ok.entries()) {
        const path = attachmentPath(companyId, formId, kind, file.name, Date.now() + i);
        const { error } = await uploadFile("tax-forms-101", path, file, { contentType: file.type || undefined });
        if (error) throw error;
        const record: Tax101Attachment = { kind, name: file.name, path, size: file.size, uploaded_at: new Date().toISOString() };
        onChange((cur) => [...cur, record]);
      }
    } catch (e) {
      toast({
        title: "הקובץ לא הועלה",
        description: `${e instanceof Error ? e.message : String(e)}. אפשר לנסות שוב.`,
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const remove = (file: Tax101Attachment) => {
    onChange((cur) => cur.filter((f) => f.path !== file.path));
    undoToast(`הקובץ ${file.name} הוסר מהטופס`, {
      onUndo: () => onChange((cur) => (cur.some((f) => f.path === file.path) ? cur : [...cur, file])),
    });
  };

  return (
    <section id="t101-attachments" aria-labelledby="t101-attachments-title" tabIndex={-1} className="space-y-3 rounded-lg border bg-background p-4 outline-none">
      <div className="flex items-center gap-2">
        <Paperclip className="h-5 w-5 text-primary" aria-hidden="true" />
        <h2 id="t101-attachments-title" className="text-base font-semibold">נספחים</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        המסמכים שהטופס מבקש לצרף לפי מה שסימנת. אפשר לצלם בטלפון או להעלות PDF / תמונה, עד 10MB לקובץ.
      </p>

      <ul className="divide-y rounded-md border">
        {requirements.map((req) => {
          const mine = files.filter((f) => f.kind === req.kind);
          const done = mine.length > 0;
          const busy = uploading === req.kind;
          return (
            <li key={req.kind} className={cn("space-y-2 p-3", req.required && !done && "bg-red-50/60 dark:bg-red-950/20")}>
              <div className="flex flex-wrap items-start gap-2">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="צורף" />
                ) : req.required ? (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="חובה לצרף" />
                ) : (
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {req.label}
                    {req.section && <span className="ms-1 text-xs font-normal text-muted-foreground">({req.section})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {done ? "צורף" : req.required ? "חובה לצרף לפני החתימה" : "לא חובה"}
                  </p>
                </div>
              </div>

              {mine.length > 0 && (
                <ul className="space-y-1">
                  {mine.map((f) => (
                    <li key={f.path} className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 text-xs">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate" dir="auto">{f.name}</span>
                      <span className="tabular-nums text-muted-foreground">{formatSize(f.size)}</span>
                      <IconButton label={`הסר את ${f.name}`} variant="ghost" size="icon" disabled={disabled} onClick={() => remove(f)}>
                        <X />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}

              <FileDrop
                accept={TAX101_ATTACHMENT_ACCEPT}
                multiple
                disabled={disabled || uploading !== null}
                onFiles={(picked) => void upload(req.kind, picked)}
                title={
                  busy ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> מעלה…
                    </span>
                  ) : done ? (
                    "הוספת קובץ נוסף"
                  ) : (
                    "גררו קובץ לכאן או לחצו לבחירה / צילום"
                  )
                }
                hint="PDF או תמונה, עד 10MB"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
