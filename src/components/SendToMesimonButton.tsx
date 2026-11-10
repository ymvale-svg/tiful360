import { useEffect, useRef, useState } from "react";
import { ExternalLink, ListTodo, Paperclip, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";

// Select values that aren't Mesimon ids
const SUBJECT_PROJECT = "subject";
const NO_ASSIGNEE = "none";
// Files travel base64-encoded through the edge function — keep the total modest
const MAX_TOTAL_MB = 20;

interface Props {
  ticket: {
    id: string;
    company_id: string | null;
    status?: string | null;
    mesimon_task_id?: string | null;
    mesimon_task_url?: string | null;
  };
}

interface MesimonOptions {
  users: { id: number; name: string; email: string; department: string }[];
  projects: { id: number; name: string }[];
  defaultProject: string;
  defaultDueDate: string;
  defaultAssigneeEmail: string;
  maxFiles: number;
  maxUploadMb: number;
  allowedExtensions: string[];
}

async function invokeMesimon<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("create-mesimon-task", { body });
  if (error) {
    // The function's own message (e.g. "file type not allowed") beats the generic non-2xx one
    const context = (error as { context?: Response }).context;
    const detail = await context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  return data as T;
}

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/**
 * Turns a service ticket into a Mesimon task. The dialog offers project, assignee, due date and
 * files, prefilled with the defaults: the subject's project, the sender, two business days.
 * Hidden when the connection isn't configured for the ticket's company; once sent, shows a link
 * to the task instead.
 */
export function SendToMesimonButton({ ticket }: Props) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [project, setProject] = useState(SUBJECT_PROJECT);
  const [assignee, setAssignee] = useState(NO_ASSIGNEE);
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  /** Progress line while sending — encoding up to 20MB and the Mesimon round-trip can take a while. */
  const [stage, setStage] = useState("");

  // Availability is per company — one check per company, not per ticket
  const { data: status } = useQuery({
    queryKey: ["mesimon-status", ticket.company_id],
    enabled: !!ticket.company_id && !ticket.mesimon_task_id,
    staleTime: Infinity,
    gcTime: Infinity,
    queryFn: () =>
      invokeMesimon<{ available: boolean }>({ action: "status", ticket_id: ticket.id }).catch(() => ({ available: false })),
  });

  const { data: options, isLoading: optionsLoading, error: optionsError } = useQuery({
    queryKey: ["mesimon-options", ticket.id],
    enabled: open,
    staleTime: 60 * 1000,
    queryFn: () => invokeMesimon<MesimonOptions>({ action: "options", ticket_id: ticket.id }),
  });

  // Start loading Mesimon's lists as soon as the button is shown, so the dialog opens ready
  const prefetchOptions = () =>
    queryClient.prefetchQuery({
      queryKey: ["mesimon-options", ticket.id],
      staleTime: 60 * 1000,
      queryFn: () => invokeMesimon<MesimonOptions>({ action: "options", ticket_id: ticket.id }),
    });
  useEffect(() => {
    if (status?.available && !ticket.mesimon_task_id && ticket.status !== "done") prefetchOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.available, ticket.id]);

  // Prefill the defaults each time the dialog opens with fresh options
  useEffect(() => {
    if (!open || !options) return;
    const subjectProject = options.projects.find((p) => p.name === options.defaultProject);
    setProject(subjectProject ? String(subjectProject.id) : SUBJECT_PROJECT);
    const sender = options.users.find(
      (u) => u.email.toLowerCase() === options.defaultAssigneeEmail.toLowerCase(),
    );
    setAssignee(sender ? String(sender.id) : NO_ASSIGNEE);
    setDueDate(options.defaultDueDate);
  }, [open, options]);

  if (ticket.mesimon_task_id) {
    const label = `משימה ${ticket.mesimon_task_id} במשימון`;
    return ticket.mesimon_task_url ? (
      <a
        href={ticket.mesimon_task_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm px-3 min-h-11 sm:min-h-9 rounded-md border border-border hover:bg-muted flex items-center gap-1"
        title="פתיחת המשימה במשימון"
      >
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </a>
    ) : (
      <span className="text-sm px-3 min-h-9 rounded-md border border-border flex items-center gap-1 text-muted-foreground">
        <ListTodo className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </span>
    );
  }

  // A closed ticket has nothing left to hand over
  if (!status?.available || ticket.status === "done") return null;

  const projectOptions = [
    // The subject's project doesn't exist yet — Mesimon creates it with this task
    ...(options && !options.projects.some((p) => p.name === options.defaultProject)
      ? [{ value: SUBJECT_PROJECT, label: `${options.defaultProject} (פרויקט חדש)` }]
      : []),
    ...(options?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })),
  ];
  const assigneeOptions = [
    { value: NO_ASSIGNEE, label: "ללא אחראי" },
    ...(options?.users ?? []).map((u) => ({
      value: String(u.id),
      label: u.department ? `${u.name} · ${u.department}` : u.name,
    })),
  ];

  const addFiles = (list: FileList | null) => {
    if (!list || !options) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (options.allowedExtensions.length && !options.allowedExtensions.includes(ext)) {
        toast.error(`סוג הקובץ .${ext} אינו מורשה במשימון`, { description: `מותרים: ${options.allowedExtensions.join(", ")}` });
        continue;
      }
      if (file.size > options.maxUploadMb * 1024 * 1024) {
        toast.error(`הקובץ "${file.name}" גדול מ-${options.maxUploadMb}MB`);
        continue;
      }
      if (next.length >= options.maxFiles) {
        toast.error(`ניתן לצרף עד ${options.maxFiles} קבצים`);
        break;
      }
      next.push(file);
    }
    if (next.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_MB * 1024 * 1024) {
      toast.error(`סך הקבצים גדול מ-${MAX_TOTAL_MB}MB`);
      return;
    }
    setFiles(next);
  };

  const reset = () => {
    setNote("");
    setFiles([]);
  };

  const send = async () => {
    setSending(true);
    try {
      const encoded: { name: string; mime: string; data: string }[] = [];
      for (const [i, f] of files.entries()) {
        setStage(`מכין קובץ ${i + 1} מתוך ${files.length}…`);
        encoded.push({ name: f.name, mime: f.type, data: await readAsDataUrl(f) });
      }
      const totalMb = files.reduce((n, f) => n + f.size, 0) / (1024 * 1024);
      setStage(files.length ? `שולח למשימון (${totalMb.toFixed(1)}MB)…` : "יוצר משימה במשימון…");
      const data = await invokeMesimon<{ existing?: boolean; assigned?: boolean; assignee_email?: string }>({
        action: "create",
        ticket_id: ticket.id,
        note: note.trim(),
        project_id: project === SUBJECT_PROJECT ? null : Number(project),
        assignee_id: assignee === NO_ASSIGNEE ? null : Number(assignee),
        unassigned: assignee === NO_ASSIGNEE,
        due_date: dueDate || null,
        files: encoded,
      });
      if (data?.existing) toast.success("הקריאה כבר קיימת כמשימה במשימון");
      else toast.success("נוצרה משימה במשימון");
      await queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      setOpen(false);
      reset();
    } catch (e) {
      toast.error("יצירת המשימה במשימון נכשלה", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
      setStage("");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm px-3 min-h-11 sm:min-h-9 rounded-md border border-border hover:bg-muted flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="יצירת משימה במשימון מהקריאה"
      >
        <ListTodo className="w-3.5 h-3.5" aria-hidden="true" />
        הפוך למשימה במשימון
      </button>
      {/* Closing is blocked while the task is being sent. */}
      <Dialog open={open} onOpenChange={(v) => { if (sending) return; setOpen(v); if (!v) reset(); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>הפיכת הקריאה למשימה במשימון</DialogTitle>
            <DialogDescription>
              כשהמשימה תסומן כהושלמה במשימון, הקריאה תיסגר כאן ויישלח מייל למי שפתח אותה.
            </DialogDescription>
          </DialogHeader>
          {optionsLoading ? (
            <p role="status" className="text-sm text-muted-foreground py-6 text-center">טוען נתונים ממשימון...</p>
          ) : optionsError ? (
            <p role="alert" className="text-sm text-destructive py-6 text-center">
              {optionsError instanceof Error ? optionsError.message : "טעינת הנתונים ממשימון נכשלה"}
            </p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1" role="group" aria-labelledby="mesimon-project-label">
                <Label id="mesimon-project-label">פרויקט</Label>
                <SearchableSelect value={project} onChange={setProject} options={projectOptions} searchPlaceholder="חיפוש פרויקט..." />
              </div>
              <div className="space-y-1" role="group" aria-labelledby="mesimon-assignee-label">
                <Label id="mesimon-assignee-label">אחראי</Label>
                <SearchableSelect value={assignee} onChange={setAssignee} options={assigneeOptions} searchPlaceholder="חיפוש משתמש..." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mesimon-due">תאריך יעד</Label>
                <Input id="mesimon-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} dir="ltr" className="text-right" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mesimon-note">הערה (לא חובה)</Label>
                <Textarea id="mesimon-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
              </div>
              <div className="space-y-1" role="group" aria-labelledby="mesimon-files-label">
                <Label id="mesimon-files-label">קבצים (לא חובה)</Label>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  accept={options?.allowedExtensions.map((e) => `.${e}`).join(",")}
                  onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                />
                <Button type="button" variant="outline" className="gap-1" disabled={sending} onClick={() => fileInput.current?.click()}>
                  <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                  הוספת קובץ
                </Button>
                {files.length > 0 && (
                  <ul className="space-y-1 pt-1">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm rounded-md border border-border ps-2">
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setFiles(files.filter((_, j) => j !== i))}
                          disabled={sending}
                          className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                          aria-label={`הסרת ${f.name}`}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {sending && stage && (
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{stage}</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>ביטול</Button>
            <Button onClick={send} disabled={!options} loading={sending} loadingText="יוצר משימה…">צור משימה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
