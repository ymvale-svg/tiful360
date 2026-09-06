import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MapPin, Plus } from "lucide-react";
import { useSites, useCreateSite } from "@/hooks/useSites";
import { toast } from "@/hooks/use-toast";

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

/** Site picker with inline creation of a new site straight from the dropdown area. */
export function SiteSelect({ value, onChange, label = "אתר" }: Props) {
  const { data: sites } = useSites();
  const createSite = useCreateSite();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", contact_name: "", phone: "" });

  const options = useMemo(
    () =>
      (sites ?? [])
        .filter((s) => s.is_active)
        .map((s) => ({ value: s.id, label: s.address ? `${s.name} — ${s.address}` : s.name })),
    [sites],
  );

  const submit = async () => {
    if (!form.name.trim()) return;
    try {
      const site = await createSite.mutateAsync(form);
      onChange(site.id);
      setAddOpen(false);
      setForm({ name: "", address: "", contact_name: "", phone: "" });
      toast({ title: "האתר נוסף", description: site.name });
    } catch (e: any) {
      toast({ title: "שגיאה בהוספת אתר", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <Label className="text-sm mb-1.5 flex items-center gap-1.5">
        <MapPin className="w-4 h-4 text-primary" /> {label}
      </Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchableSelect
            value={value}
            onChange={onChange}
            options={options}
            placeholder="בחר אתר..."
            searchPlaceholder="חיפוש אתר..."
            emptyText="אין אתרים — הוסיפו אתר חדש"
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" /> אתר חדש
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" /> הוספת אתר
            </DialogTitle>
            <DialogDescription>אתר או מיקום מחוץ למשרד שאליו ניתן לשייך ציוד.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm mb-1.5 block">שם האתר *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} dir="rtl" />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">כתובת</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-sm mb-1.5 block">איש קשר</Label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} dir="rtl" />
              </div>
              <div>
                <Label className="text-sm mb-1.5 block">טלפון</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>ביטול</Button>
              <Button className="flex-1" disabled={!form.name.trim() || createSite.isPending} onClick={submit}>
                {createSite.isPending ? "שומר..." : "הוסף אתר"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
