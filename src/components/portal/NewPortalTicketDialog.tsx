import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Loader2, MapPin, Package, Paperclip, Phone, Plus } from "lucide-react";
import { TICKET_PRIORITIES, TICKET_SUBJECTS } from "@/lib/serviceTickets";
import {
  useCreateServiceTicket,
  useEmployeeAssetOptions,
  uploadTicketAttachments,
} from "@/hooks/useServiceTickets";
import { useCompany } from "@/hooks/useCompany";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName?: string | null;
  employeePhone?: string | null;
}

export function NewPortalTicketDialog({ open, onOpenChange, employeeId, employeeName, employeePhone }: Props) {
  const { activeCompanyId } = useCompany();
  const createTicket = useCreateServiceTicket();
  const { data: assets } = useEmployeeAssetOptions(open ? employeeId : null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [subject, setSubject] = useState<string>("computing");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [location, setLocation] = useState("");
  const [phone, setPhone] = useState("");
  const [assetId, setAssetId] = useState<string>("none");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && employeePhone && !phone) setPhone(employeePhone);
  }, [open, employeePhone, phone]);

  const reset = () => {
    setSubject("computing");
    setTitle("");
    setDescription("");
    setPriority("medium");
    setLocation("");
    setPhone(employeePhone ?? "");
    setAssetId("none");
    setFiles([]);
  };

  const submit = async () => {
    if (!title.trim()) return toast.error("יש להזין כותרת לקריאה");
    setSubmitting(true);
    try {
      const attachments = activeCompanyId && files.length
        ? await uploadTicketAttachments(activeCompanyId, files)
        : [];
      await createTicket.mutateAsync({
        employeeId,
        subject,
        title: title.trim(),
        description,
        priority,
        location,
        contactPhone: phone,
        relatedAssetId: assetId === "none" ? null : assetId,
        attachments,
      });
      toast.success("הקריאה נפתחה ונשלחה לתפעול");
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
      <DialogContent dir="rtl" className="max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl font-bold">פתיחת קריאת שירות</DialogTitle>
          <DialogDescription>
            {employeeName ? `נפתח על ידי ${employeeName}` : "הקריאה תישלח למחלקת התפעול"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pt-subject">נושא הקריאה</Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger id="pt-subject"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_SUBJECTS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pt-title"><span className="text-destructive">*</span> כותרת קצרה</Label>
            <Input id="pt-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="תאר בקצרה את התקלה או הבקשה" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pt-desc">תיאור מפורט</Label>
            <Textarea id="pt-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="פרטים נוספים שיעזרו לתפעול לטפל מהר יותר" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pt-asset" className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" aria-hidden="true" /> פריט ציוד קשור
            </Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger id="pt-asset"><SelectValue placeholder="ללא" /></SelectTrigger>
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
            <Label htmlFor="pt-priority">דחיפות</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="pt-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TICKET_PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pt-loc" className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> מיקום
              </Label>
              <Input id="pt-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="קומה / חדר" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-phone" className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" aria-hidden="true" /> טלפון
              </Label>
              <Input id="pt-phone" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" />
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
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(e) => e.target.files && setFiles((p) => [...p, ...Array.from(e.target.files!)])}
            />
            <Button variant="outline" type="button" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
              <Camera className="w-4 h-4" aria-hidden="true" /> צילום או קובץ
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1 gap-2" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              פתח קריאה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
