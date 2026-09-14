import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Container, Plus } from "lucide-react";
import { useSiteContainers, useCreateSiteContainer } from "@/hooks/useSiteContainers";
import { toast } from "@/hooks/use-toast";

interface Props {
  siteId: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

/** Container picker for a given site, with inline creation straight from the dropdown area. */
export function ContainerSelect({ siteId, value, onChange, label = "מכולה" }: Props) {
  const { data: containers } = useSiteContainers(siteId);
  const createContainer = useCreateSiteContainer();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");

  const options = useMemo(
    () =>
      (containers ?? [])
        .filter((c) => c.is_active)
        .map((c) => ({ value: c.id, label: c.name })),
    [containers],
  );

  const submit = async () => {
    if (!name.trim() || !siteId) return;
    try {
      const container = await createContainer.mutateAsync({ site_id: siteId, name });
      onChange(container.id);
      setAddOpen(false);
      setName("");
      toast({ title: "המכולה נוספה", description: container.name });
    } catch (e: any) {
      toast({ title: "שגיאה בהוספת מכולה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div>
      <Label className="text-sm mb-1.5 flex items-center gap-1.5">
        <Container className="w-4 h-4 text-primary" /> {label}
      </Label>
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchableSelect
            value={value}
            onChange={onChange}
            options={options}
            placeholder="בחר מכולה..."
            searchPlaceholder="חיפוש מכולה..."
            emptyText="אין מכולות באתר זה — הוסיפו מכולה חדשה"
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4" /> מכולה חדשה
        </Button>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Container className="w-5 h-5 text-primary" /> הוספת מכולה
            </DialogTitle>
            <DialogDescription>מכולה חדשה באתר שנבחר, לציון מיקום האחסון הפיזי של הציוד.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm mb-1.5 block">שם המכולה *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} dir="rtl" placeholder='לדוגמה: מכולה 1' />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAddOpen(false)}>ביטול</Button>
              <Button className="flex-1" disabled={!name.trim() || createContainer.isPending} onClick={submit}>
                {createContainer.isPending ? "שומר..." : "הוסף מכולה"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
