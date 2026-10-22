import { useState } from "react";
import { ExternalLink, ListTodo } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { subjectLabel } from "@/lib/serviceTickets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";


interface Props {
  ticket: {
    id: string;
    company_id: string | null;
    status?: string | null;
    subject_category?: string | null;
    ticket_type?: string | null;
    mesimon_task_id?: string | null;
    mesimon_task_url?: string | null;
  };
}

/**
 * Turns a service ticket into a Mesimon task, assigned to the sender and due in two business days.
 * Hidden when the connection isn't configured for the ticket's company; once sent, shows a link
 * to the task instead.
 */
export function SendToMesimonButton({ ticket }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  // Availability is per company — one check per company, not per ticket
  const { data: status } = useQuery({
    queryKey: ["mesimon-status", ticket.company_id],
    enabled: !!ticket.company_id && !ticket.mesimon_task_id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("create-mesimon-task", {
        body: { action: "status", ticket_id: ticket.id },
      });
      if (error) return { available: false };
      return data as { available: boolean };
    },
  });

  if (ticket.mesimon_task_id) {
    const label = `משימה ${ticket.mesimon_task_id} במשימון`;
    return ticket.mesimon_task_url ? (
      <a
        href={ticket.mesimon_task_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted flex items-center gap-1"
        title="פתיחת המשימה במשימון"
      >
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </a>
    ) : (
      <span className="text-xs px-3 py-1.5 rounded-md border border-border flex items-center gap-1 text-muted-foreground">
        <ListTodo className="w-3.5 h-3.5" aria-hidden="true" />
        {label}
      </span>
    );
  }

  // A closed ticket has nothing left to hand over
  if (!status?.available || ticket.status === "done") return null;

  // Mesimon keeps one project per ticket subject, named by its label
  const project = subjectLabel(ticket.subject_category ?? ticket.ticket_type);

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-mesimon-task", {
        body: {
          action: "create",
          ticket_id: ticket.id,
          note: note.trim(),
        },
      });
      if (error) {
        // The function's own message (e.g. "no such department in Mesimon") beats the generic non-2xx one
        const context = (error as { context?: Response }).context;
        const detail = await context?.json?.().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      if (data?.existing) toast.success("הקריאה כבר קיימת כמשימה במשימון");
      else if (data?.assigned === false) {
        toast.warning("המשימה נוצרה במשימון ללא אחראי", {
          description: `לא נמצא במשימון משתמש פעיל עם הדואר ${data.assignee_email || "שלך"}`,
        });
      } else toast.success("נוצרה משימה במשימון ושויכה אליך");
      await queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      setOpen(false);
      setNote("");
    } catch (e) {
      toast.error("יצירת המשימה במשימון נכשלה", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted flex items-center gap-1"
        title="יצירת משימה במשימון מהקריאה"
      >
        <ListTodo className="w-3.5 h-3.5" aria-hidden="true" />
        הפוך למשימה במשימון
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הפיכת הקריאה למשימה במשימון</DialogTitle>
            <DialogDescription>
              המשימה תיפתח במשימון בפרויקט "{project}", תשויך אליך ותקבל תאריך יעד בעוד שני ימי עבודה.
              כשהמשימה תסומן כהושלמה במשימון, הקריאה תיסגר כאן ויישלח מייל למי שפתח אותה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="mesimon-note">הערה (לא חובה)</Label>
              <Textarea id="mesimon-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>ביטול</Button>
            <Button onClick={send} disabled={sending}>{sending ? "יוצר..." : "צור משימה"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
