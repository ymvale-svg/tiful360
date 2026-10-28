import { useEffect, useRef, useState } from "react";
import { formatDateTimeDMY } from "@/lib/utils";
import { Megaphone, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FormField, focusFirstInvalid } from "@/components/feedback/FormField";
import { IconButton } from "@/components/feedback/IconButton";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";
import { StateView } from "@/components/feedback/StateView";
import { useToast } from "@/hooks/use-toast";
import {
  useCompanyAnnouncements, useAnnouncementMutations, useSignatureDefaults,
  announcementStatus, type Announcement,
} from "@/hooks/useAnnouncements";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  scheduled: { label: "מתוזמנת", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  active: { label: "פעילה", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  expired: { label: "פגה", className: "bg-muted text-muted-foreground border-border" },
};

export default function Announcements() {
  const { toast } = useToast();
  const { data: announcements = [], isLoading, error: loadError, refetch } = useCompanyAnnouncements();
  const { data: signature } = useSignatureDefaults();
  const { create, update, remove } = useAnnouncementMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const confirm = useConfirm();
  const formRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<{ title?: string; content?: string; expires?: string }>({});

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [publishedAt, setPublishedAt] = useState(toLocalInput(new Date().toISOString()));
  const [expiresAt, setExpiresAt] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderRole, setSenderRole] = useState("");

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (editing) {
      setTitle(editing.title);
      setContent(editing.content);
      setPublishedAt(toLocalInput(editing.published_at));
      setExpiresAt(toLocalInput(editing.expires_at));
      setSenderName(editing.sender_name ?? "");
      setSenderRole(editing.sender_role ?? "");
    } else {
      setTitle("");
      setContent("");
      setPublishedAt(toLocalInput(new Date().toISOString()));
      setExpiresAt("");
      setSenderName(signature?.name ?? "");
      setSenderRole(signature?.role ?? "");
    }
  }, [open, editing, signature]);

  // Dirty = the title/content differ from what the dialog opened with (a new draft starts empty).
  const dirty = editing
    ? title !== editing.title || content !== editing.content
    : !!(title.trim() || content.trim());
  const saving = create.isPending || update.isPending;
  const guard = useDirtyGuard(dirty, saving);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (a: Announcement) => { setEditing(a); setOpen(true); };

  const save = async () => {
    const nextErrors = {
      title: title.trim() ? undefined : "כתבו כותרת להודעה",
      content: content.trim() ? undefined : "כתבו את תוכן ההודעה",
      expires: expiresAt && publishedAt && new Date(expiresAt) <= new Date(publishedAt) ? "התפוגה חייבת להיות אחרי מועד הפרסום" : undefined,
    };
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.content || nextErrors.expires) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }
    const payload = {
      title: title.trim(),
      content: content.trim(),
      published_at: new Date(publishedAt || Date.now()).toISOString(),
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      sender_name: senderName.trim() || null,
      sender_role: senderRole.trim() || null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...payload });
      else await create.mutateAsync(payload);
      toast({ title: editing ? "ההודעה עודכנה" : "ההודעה פורסמה" });
      setOpen(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const confirmDelete = async (a: Announcement) => {
    const ok = await confirm({
      title: `למחוק את ההודעה "${a.title}"?`,
      description: "ההודעה תוסר לצמיתות מהפורטל של כל העובדים.",
      confirmLabel: "מחק הודעה",
      destructive: true,
      onConfirm: () => remove.mutateAsync(a.id),
    });
    if (ok) toast({ title: "ההודעה נמחקה" });
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">הודעות לפורטל העובדים</h1>
          <p className="page-subtitle">פרסום, תזמון וניהול הודעות שמוצגות לעובדים בפורטל</p>
        </div>
        <Button className="gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" aria-hidden="true" />
          הודעה חדשה
        </Button>
      </div>

      <StateView
        loading={isLoading}
        error={loadError}
        onRetry={() => { void refetch(); }}
        label="את ההודעות"
        isEmpty={announcements.length === 0}
        empty={{
          icon: <Megaphone className="w-6 h-6" />,
          title: "אין הודעות עדיין",
          description: "הודעה שתפרסמו תופיע בפורטל העובדים בזמן שתבחרו.",
          action: <Button onClick={openNew} className="gap-1.5"><Plus className="w-4 h-4" aria-hidden="true" />הודעה חדשה</Button>,
        }}
      >
        <div className="space-y-3">
          {announcements.map((a) => {
            const status = STATUS_META[announcementStatus(a)];
            return (
              <div key={a.id} className="bg-card rounded-xl border border-border/50 p-4 shadow-card">
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{a.title}</h3>
                    <Badge variant="outline" className={status.className}>{status.label}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton label={`ערוך את ההודעה ${a.title}`} onClick={() => openEdit(a)}>
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton label={`מחק את ההודעה ${a.title}`} className="text-destructive hover:text-destructive" onClick={() => { void confirmDelete(a); }}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{a.content}</p>
                <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>פרסום: {formatDateTimeDMY(a.published_at)}</span>
                  {a.expires_at && <span>תפוגה: {formatDateTimeDMY(a.expires_at)}</span>}
                  {a.sender_name && (
                    <span>בברכה, {a.sender_name}{a.sender_role ? ` · ${a.sender_role}` : ""}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </StateView>

      <Dialog open={open} onOpenChange={guard(setOpen)}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הודעה" : "הודעה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" ref={formRef}>
            <FormField label="כותרת" required error={errors.title} id="ann-title">
              <Input value={title} onChange={(e) => { setTitle(e.target.value); if (errors.title) setErrors((x) => ({ ...x, title: undefined })); }} placeholder="כותרת ההודעה" />
            </FormField>
            <FormField label="תוכן" required error={errors.content} id="ann-content">
              <Textarea rows={6} value={content} onChange={(e) => { setContent(e.target.value); if (errors.content) setErrors((x) => ({ ...x, content: undefined })); }} placeholder="תוכן ההודעה" />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="תאריך ושעת פרסום" id="ann-published">
                <Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              </FormField>
              <FormField label="תאריך תפוגה (לא חובה)" error={errors.expires} id="ann-expires">
                <Input type="datetime-local" value={expiresAt} onChange={(e) => { setExpiresAt(e.target.value); if (errors.expires) setErrors((x) => ({ ...x, expires: undefined })); }} />
              </FormField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="חתימה - שם" id="ann-sender-name">
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="שם השולח" />
              </FormField>
              <FormField label="חתימה - תפקיד" id="ann-sender-role">
                <Input value={senderRole} onChange={(e) => setSenderRole(e.target.value)} placeholder="תפקיד השולח" />
              </FormField>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => guard(setOpen)(false)} disabled={saving}>
              <X className="w-4 h-4" aria-hidden="true" />
              ביטול
            </Button>
            <Button className="gap-1.5" onClick={save} loading={saving} loadingText="שומר…">
              <Save className="w-4 h-4" aria-hidden="true" />
              {editing ? "שמירה" : "פרסום"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
