import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Plus, MapPin, Phone, Tag, MessageSquare, ListChecks, Zap, Info, Paperclip, Camera, Loader2 } from "lucide-react";

interface NewITTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TICKET_TYPES: { value: string; label: string }[] = [
  { value: "hardware", label: "תמיכה טכנית" },
  { value: "software", label: "תוכנה / רישיונות" },
  { value: "access", label: "הרשאות וגישה" },
  { value: "offboarding", label: "ניתוקים / סיום העסקה" },
];

const PRIORITIES: { value: string; label: string }[] = [
  { value: "low", label: "נמוך" },
  { value: "medium", label: "רגיל" },
  { value: "high", label: "גבוה" },
  { value: "critical", label: "קריטי" },
];

const STATUSES: { value: string; label: string }[] = [
  { value: "open", label: "בפתיחה" },
  { value: "in_progress", label: "בטיפול" },
  { value: "done", label: "טופל" },
];

export function NewITTicketDialog({ open, onOpenChange }: NewITTicketDialogProps) {
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [siteId, setSiteId] = useState<string>("");
  const [siteLocation, setSiteLocation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ticketType, setTicketType] = useState<string>("hardware");
  const [status, setStatus] = useState<string>("open");
  const [priority, setPriority] = useState<string>("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch caller employee (linked to current user) to prefill phone + employee_id
  const { data: callerEmployee } = useQuery({
    queryKey: ["caller-employee", user?.id, activeCompanyId],
    enabled: !!user?.id && !!activeCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, phone")
        .eq("linked_user_id", user!.id)
        .eq("company_id", activeCompanyId!)
        .maybeSingle();
      return data;
    },
  });

  // Sub-employers as "Sites" list for the company
  const { data: sites } = useQuery({
    queryKey: ["ticket-sites", activeCompanyId],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("sub_employers")
        .select("id, legal_name")
        .eq("company_id", activeCompanyId!)
        .eq("is_active", true)
        .order("legal_name");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (open && callerEmployee?.phone && !contactPhone) {
      setContactPhone(callerEmployee.phone);
    }
  }, [open, callerEmployee, contactPhone]);

  const reset = () => {
    setSiteId("");
    setSiteLocation("");
    setContactPhone("");
    setTitle("");
    setDescription("");
    setTicketType("hardware");
    setStatus("open");
    setPriority("medium");
    setFiles([]);
  };

  const generateTicketCode = () => {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return `IT-${ts}-${rand}`;
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!activeCompanyId) return toast.error("לא נבחרה חברה פעילה");
    if (!title.trim()) return toast.error("יש להזין תיאור קריאה");
    if (!callerEmployee?.id) return toast.error("המשתמש שלך אינו מקושר לרשומת עובד");

    setSubmitting(true);
    try {
      // Upload attachments (best-effort)
      const attachmentUrls: string[] = [];
      for (const f of files) {
        const path = `it-tickets/${activeCompanyId}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("documents")
          .upload(path, f, { upsert: false });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("documents").getPublicUrl(path);
          attachmentUrls.push(pub.publicUrl);
        }
      }

      const checklist: any[] = [];
      if (siteLocation) checklist.push({ label: `מיקום: ${siteLocation}`, done: false });
      if (contactPhone) checklist.push({ label: `טלפון איש קשר: ${contactPhone}`, done: false });
      if (description) checklist.push({ label: description, done: false, type: "description" });
      attachmentUrls.forEach(url => checklist.push({ label: "קובץ מצורף", url, done: false, type: "attachment" }));

      const titleWithSite = siteId
        ? `${title} — ${(sites ?? []).find(s => s.id === siteId)?.legal_name ?? ""}`
        : title;

      const { data: inserted, error } = await supabase.from("it_tickets").insert({
        company_id: activeCompanyId,
        employee_id: callerEmployee.id,
        ticket_code: generateTicketCode(),
        title: titleWithSite,
        ticket_type: ticketType as any,
        priority: priority as any,
        status: status as any,
        checklist: checklist as any,
      }).select("id").single();
      if (error) throw error;

      // Notify configured IT recipients (best-effort)
      if (inserted?.id) {
        supabase.functions.invoke("notify-it-ticket", {
          body: { ticket_id: inserted.id },
        }).catch(err => console.warn("notify-it-ticket failed", err));
      }

      toast.success("הקריאה נפתחה בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "שגיאה בפתיחת הקריאה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="items-center text-center">
          <div className="flex items-center justify-center gap-2">
            <DialogTitle className="text-2xl font-bold">קריאה חדשה</DialogTitle>
            <div className="w-7 h-7 rounded-full bg-warning text-warning-foreground flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
          </div>
          <DialogDescription>פתיחת קריאת שירות חדשה</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Site + location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 justify-end text-sm">
                <span className="text-destructive">*</span> אתר <MapPin className="w-3.5 h-3.5 text-warning" />
              </Label>
              <Select value={siteId} onValueChange={setSiteId}>
                <SelectTrigger><SelectValue placeholder="בחר אתר" /></SelectTrigger>
                <SelectContent>
                  {(sites ?? []).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.legal_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 justify-end text-sm">
                מיקום באתר <MapPin className="w-3.5 h-3.5 text-warning" />
              </Label>
              <Input value={siteLocation} onChange={e => setSiteLocation(e.target.value)} placeholder="לדוגמה: קומה 3, חדר 201" />
            </div>
          </div>

          {/* Contact phone */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 justify-end text-sm">
              <span className="text-destructive">*</span> טלפון איש קשר לתקלה <Phone className="w-3.5 h-3.5 text-warning" />
            </Label>
            <p className="text-xs text-muted-foreground text-right">
              (אם המס׳ המופיע שונה, יש לעדכן למס׳ איש הקשר לתקלה בגינה נפתחת הקריאה)
            </p>
            <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} dir="ltr" />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 justify-end text-sm">
              <span className="text-destructive">*</span> תיאור הקריאה <Tag className="w-3.5 h-3.5 text-warning" />
            </Label>
            <Input value={title} onChange={e => setTitle(e.target.value.slice(0, 120))} placeholder="תאר בקצרה את הבעיה" />
            <div className="text-xs text-muted-foreground text-left">{title.length} / 120</div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 justify-end text-sm">
              תיאור נוסף <MessageSquare className="w-3.5 h-3.5 text-warning" />
            </Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="ספרו לנו עוד פרטים על הבעיה..." rows={4} />
          </div>

          {/* Ticket type */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 justify-end text-sm">
              סוג קריאת שירות <ListChecks className="w-3.5 h-3.5 text-warning" />
            </Label>
            <Select value={ticketType} onValueChange={setTicketType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 justify-end text-sm">
                סטטוס <Info className="w-3.5 h-3.5 text-warning" />
              </Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="bg-muted"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1 justify-end text-sm">
                דחיפות <Zap className="w-3.5 h-3.5 text-warning" />
              </Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 justify-end text-sm">
              קבצים מצורפים <Paperclip className="w-3.5 h-3.5 text-warning" />
            </Label>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <button onClick={() => removeFile(i)} className="text-destructive">הסר</button>
                    <span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesChange} />
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" type="button" onClick={() => fileInputRef.current?.click()} className="gap-2">
                <Camera className="w-4 h-4" />
                הדבק צילום מסך
              </Button>
              <Button type="button" onClick={() => fileInputRef.current?.click()} className="gap-2 bg-primary">
                <Plus className="w-4 h-4" />
                הוסף קובץ
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">ביטול</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1 gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              פתח קריאה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
