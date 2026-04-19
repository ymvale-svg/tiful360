import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUpsertDigitalAccess } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  existing?: any;
}

export function AddDigitalAccessDialog({ open, onOpenChange, employeeId, existing }: Props) {
  const { toast } = useToast();
  const upsert = useUpsertDigitalAccess();
  const [form, setForm] = useState<any>({
    access_type: "",
    resource_path: "",
    permission_level: "read",
    status: "active",
    notes: "",
  });

  useEffect(() => {
    if (existing) {
      setForm({
        access_type: existing.access_type ?? "",
        resource_path: existing.resource_path ?? "",
        permission_level: existing.permission_level ?? "read",
        status: existing.status ?? "active",
        notes: existing.notes ?? "",
      });
    } else {
      setForm({ access_type: "", resource_path: "", permission_level: "read", status: "active", notes: "" });
    }
  }, [existing, open]);

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.access_type || !form.resource_path) {
      toast({ title: "חסרים שדות חובה", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: existing?.id,
        employee_id: employeeId,
        ...form,
      });
      toast({ title: existing ? "הגישה עודכנה" : "הגישה נוספה" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "עריכת גישה דיגיטלית" : "הוספת גישה דיגיטלית"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>סוג גישה *</Label>
            <Input
              placeholder="Email, VPN, CRM..."
              value={form.access_type}
              onChange={(e) => set("access_type", e.target.value)}
            />
          </div>
          <div>
            <Label>נתיב / משאב *</Label>
            <Input
              placeholder="example@company.com או /path/to/resource"
              value={form.resource_path}
              onChange={(e) => set("resource_path", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>רמת הרשאה</Label>
              <Select value={form.permission_level} onValueChange={(v) => set("permission_level", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">קריאה</SelectItem>
                  <SelectItem value="write">עריכה</SelectItem>
                  <SelectItem value="admin">מנהל</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>סטטוס</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">פעיל</SelectItem>
                  <SelectItem value="suspended">מושהה</SelectItem>
                  <SelectItem value="blocked">נחסם</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button className="flex-1" disabled={upsert.isPending} onClick={handleSave}>
            {upsert.isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
