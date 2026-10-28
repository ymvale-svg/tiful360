import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Camera, MapPin, Package, Paperclip, Phone, Plus, User } from "lucide-react";
import { TICKET_PRIORITIES, TICKET_SUBJECTS } from "@/lib/serviceTickets";
import { TicketScreenshotButton } from "@/components/TicketScreenshotButton";
import { focusFirstInvalid } from "@/components/feedback/FormField";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";
import {
  useCreateServiceTicket,
  useEmployeeAssetOptions,
  uploadTicketAttachments,
  failedAttachmentsMessage,
} from "@/hooks/useServiceTickets";

interface NewITTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewITTicketDialog({ open, onOpenChange }: NewITTicketDialogProps) {
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  const createTicket = useCreateServiceTicket();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employeeId, setEmployeeId] = useState<string>("");
  const [subject, setSubject] = useState("computing");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [location, setLocation] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [assetId, setAssetId] = useState("none");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ employee?: string; title?: string }>({});
  const formRef = useRef<HTMLDivElement>(null);
  const dirty = !!(title.trim() || description.trim() || location.trim() || files.length);
  const guard = useDirtyGuard(dirty, submitting);

  // Employees of the company — the ticket can be opened on behalf of any of them
  const { data: employees } = useQuery({
    queryKey: ["ticket-employees", activeCompanyId],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, phone, linked_user_id")
        .eq("company_id", activeCompanyId!)
        .eq("status", "active")
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: assets } = useEmployeeAssetOptions(employeeId || null);

  useEffect(() => {
    if (!open || employeeId || !employees?.length) return;
    const mine = employees.find((e: any) => e.linked_user_id === user?.id);
    if (mine) setEmployeeId(mine.id);
  }, [open, employees, employeeId, user?.id]);

  useEffect(() => {
    const emp = employees?.find((e: any) => e.id === employeeId);
    if (emp?.phone) setContactPhone(emp.phone);
    setAssetId("none");
  }, [employeeId, employees]);

  const reset = () => {
    setEmployeeId("");
    setSubject("computing");
    setTitle("");
    setDescription("");
    setPriority("medium");
    setLocation("");
    setContactPhone("");
    setAssetId("none");
    setFiles([]);
    setErrors({});
  };

  const handleSubmit = async () => {
    if (!activeCompanyId) return toast.error("לא נבחרה חברה פעילה");
    const nextErrors = {
      employee: employeeId ? undefined : "בחרו את העובד שפותח את הקריאה",
      title: title.trim() ? undefined : "כתבו כותרת קצרה לקריאה",
    };
    setErrors(nextErrors);
    if (nextErrors.employee || nextErrors.title) {
      requestAnimationFrame(() => focusFirstInvalid(formRef.current));
      return;
    }

    setSubmitting(true);
    try {
      const { uploaded: attachments, failed } = files.length
        ? await uploadTicketAttachments(activeCompanyId, files)
        : { uploaded: [], failed: [] as string[] };
      await createTicket.mutateAsync({
        employeeId,
        subject,
        title: title.trim(),
        description,
        priority,
        location,
        contactPhone,
        relatedAssetId: assetId === "none" ? null : assetId,
        attachments,
      });
      if (failed.length) toast.error(failedAttachmentsMessage(failed));
      else toast.success("הקריאה נפתחה בהצלחה");
      reset();
      onOpenChange(false);
      return;
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בפתיחת הקריאה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={guard(onOpenChange)}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl font-bold">קריאת שירות חדשה</DialogTitle>
          <DialogDescription>הקריאה נשלחת לכתובות התפעול המוגדרות בהגדרות</DialogDescription>
        </DialogHeader>

        <div className="space-y-4" ref={formRef}>
          <div className="space-y-1.5">
            <Label htmlFor="it-employee" className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" aria-hidden="true" /> פותח הקריאה<span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Select value={employeeId} onValueChange={(v) => { setEmployeeId(v); setErrors((e) => ({ ...e, employee: undefined })); }}>
              <SelectTrigger id="it-employee" aria-required="true" aria-invalid={errors.employee ? true : undefined} aria-describedby={errors.employee ? "it-employee-error" : undefined}><SelectValue placeholder="בחר עובד" /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employee && <p id="it-employee-error" role="alert" className="text-xs font-medium text-destructive">{errors.employee}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="it-subject">נושא הקריאה</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger id="it-subject"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_SUBJECTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="it-title">כותרת קצרה<span className="text-destructive ms-0.5" aria-hidden="true">*</span></Label>
            <Input
              id="it-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value.slice(0, 120)); if (errors.title) setErrors((x) => ({ ...x, title: undefined })); }}
              onBlur={() => { if (!title.trim() && title !== "") setErrors((x) => ({ ...x, title: "כתבו כותרת קצרה לקריאה" })); }}
              placeholder="תאר בקצרה את הבעיה"
              aria-required="true"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "it-title-error" : undefined}
            />
            {errors.title && <p id="it-title-error" role="alert" className="text-xs font-medium text-destructive">{errors.title}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="it-desc">תיאור מפורט</Label>
            <Textarea id="it-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="it-asset" className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" aria-hidden="true" /> פריט ציוד קשור
            </Label>
            <Select value={assetId} onValueChange={setAssetId} disabled={!employeeId}>
              <SelectTrigger id="it-asset"><SelectValue placeholder="ללא פריט" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ללא פריט</SelectItem>
                {(assets ?? []).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.asset_name} — {a.license_plate || a.asset_code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="it-priority">דחיפות</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="it-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="it-location" className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> מיקום
              </Label>
              <Input id="it-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="קומה / חדר" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-phone" className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> טלפון
              </Label>
              <Input id="it-phone" type="tel" autoComplete="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} dir="ltr" inputMode="tel" />
            </div>
          </div>

          <div className="space-y-1.5">
            <span id="it-files-label" className="flex items-center gap-1.5 text-sm font-medium">
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" /> קבצים מצורפים
            </span>
            {files.length > 0 && (
              <ul className="space-y-1" aria-labelledby="it-files-label">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded ps-2">
                    <span className="truncate">{f.name}</span>
                    <button type="button" className="min-h-10 px-3 text-sm text-destructive hover:underline shrink-0" aria-label={`הסר את ${f.name}`} disabled={submitting} onClick={() => setFiles((p) => p.filter((_, x) => x !== i))}>הסר</button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              aria-labelledby="it-files-label"
              onChange={(e) => { const picked = e.target.files ? Array.from(e.target.files) : []; if (picked.length) setFiles((p) => [...p, ...picked]); e.target.value = ""; }}
            />
            <Button variant="outline" type="button" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
              <Camera className="w-4 h-4" aria-hidden="true" /> צילום או קובץ
            </Button>
            <TicketScreenshotButton disabled={submitting} onAttach={(file) => setFiles((previous) => [...previous, file])} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => guard(onOpenChange)(false)} disabled={submitting} className="flex-1">ביטול</Button>
            <Button onClick={handleSubmit} loading={submitting} loadingText="פותח קריאה…" className="flex-1 gap-2">
              <Plus className="w-4 h-4" aria-hidden="true" />
              פתח קריאה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
