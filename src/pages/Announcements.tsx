import { useEffect, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const { data: announcements = [], isLoading } = useCompanyAnnouncements();
  const { data: signature } = useSignatureDefaults();
  const { create, update, remove } = useAnnouncementMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [publishedAt, setPublishedAt] = useState(toLocalInput(new Date().toISOString()));
  const [expiresAt, setExpiresAt] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderRole, setSenderRole] = useState("");

  useEffect(() => {
    if (!open) return;
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

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (a: Announcement) => { setEditing(a); setOpen(true); };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast({ title: "נא למלא כותרת ותוכן", variant: "destructive" });
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

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await remove.mutateAsync(deleteId);
      toast({ title: "ההודעה נמחקה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">הודעות לפורטל העובדים</h1>
          <p className="page-subtitle">פרסום, תזמון וניהול הודעות שמוצגות לעובדים בפורטל</p>
        </div>
        <Button className="gap-1.5" onClick={openNew}>
          <Plus className="w-4 h-4" />
          הודעה חדשה
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : announcements.length === 0 ? (
        <div className="bg-card rounded-xl border border-border/50 p-10 text-center">
          <Megaphone className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">אין הודעות עדיין</p>
        </div>
      ) : (
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
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(a)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={() => setDeleteId(a.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{a.content}</p>
                <div className="mt-3 pt-2 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>פרסום: {new Date(a.published_at).toLocaleString("he-IL")}</span>
                  {a.expires_at && <span>תפוגה: {new Date(a.expires_at).toLocaleString("he-IL")}</span>}
                  {a.sender_name && (
                    <span>בברכה, {a.sender_name}{a.sender_role ? ` · ${a.sender_role}` : ""}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הודעה" : "הודעה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="mb-1.5 block">כותרת</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת ההודעה" />
            </div>
            <div>
              <Label className="mb-1.5 block">תוכן</Label>
              <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="תוכן ההודעה" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">תאריך ושעת פרסום</Label>
                <Input type="datetime-local" value={publishedAt} onChange={(e) => setPublishedAt(e.target.value)} />
              </div>
              <div>
                <Label className="mb-1.5 block">תאריך תפוגה (אופציונלי)</Label>
                <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">חתימה - שם</Label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="שם השולח" />
              </div>
              <div>
                <Label className="mb-1.5 block">חתימה - תפקיד</Label>
                <Input value={senderRole} onChange={(e) => setSenderRole(e.target.value)} placeholder="תפקיד השולח" />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="gap-1.5" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
              ביטול
            </Button>
            <Button className="gap-1.5" onClick={save} disabled={create.isPending || update.isPending}>
              <Save className="w-4 h-4" />
              {create.isPending || update.isPending ? "שומר..." : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הודעה</AlertDialogTitle>
            <AlertDialogDescription>ההודעה תוסר לצמיתות מהפורטל. האם להמשיך?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>מחיקה</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
