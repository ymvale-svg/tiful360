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
import { Camera, Loader2, MapPin, Package, Paperclip, Phone, Plus, User } from "lucide-react";
import { TICKET_PRIORITIES, TICKET_SUBJECTS } from "@/lib/serviceTickets";
import {
  useCreateServiceTicket,
  useEmployeeAssetOptions,
  uploadTicketAttachments,
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
  };

  const handleSubmit = async () => {
    if (!activeCompanyId) return toast.error("לא נבחרה חברה פעילה");
    if (!employeeId) return toast.error("יש לבחור עובד");
    if (!title.trim()) return toast.error("יש להזין כותרת לקריאה");

    setSubmitting(true);
    try {
      const attachments = files.length ? await uploadTicketAttachments(activeCompanyId, files) : [];
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
      toast.success("הקריאה נפתחה בהצלחה");
      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "שגיאה בפתיחת הקריאה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl font-bold">קריאת שירות חדשה</DialogTitle>
          <DialogDescription>הקריאה נשלחת לכתובות התפעול המוגדרות בהגדרות</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="it-employee" className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" aria-hidden="true" /> פותח הקריאה
            </Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="it-employee"><SelectValue placeholder="בחר עובד" /></SelectTrigger>
              <SelectContent>
                {(employees ?? []).map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Label htmlFor="it-title"><span className="text-destructive">*</span> כותרת קצרה</Label>
            <Input id="it-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="תאר בקצרה את הבעיה" />
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
              <Input id="it-phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} dir="ltr" inputMode="tel" />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" /> קבצים מצורפים
            </span>
            {files.length > 0 && (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded px-2 py-1">
                    <button type="button" className="text-destructive" onClick={() => setFiles((p) => p.filter((_, x) => x !== i))}>הסר</button>
                    <span className="truncate">{f.name}</span>
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
              onChange={(e) => e.target.files && setFiles((p) => [...p, ...Array.from(e.target.files!)])}
            />
            <Button variant="outline" type="button" className="w-full gap-2" onClick={() => fileInputRef.current?.click()}>
              <Camera className="w-4 h-4" aria-hidden="true" /> צילום או קובץ
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">ביטול</Button>
            <Button onClick={handleSubmit} disabled={submitting} className="flex-1 gap-2">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Plus className="w-4 h-4" aria-hidden="true" />}
              פתח קריאה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
