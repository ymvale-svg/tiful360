import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useEmployees } from "@/hooks/useData";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useCreateTax101Batch } from "@/hooks/useTax101";
import { useToast } from "@/hooks/use-toast";
import { FileText, Loader2, Search } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CreateTax101BatchDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: employees = [] } = useEmployees();
  const createBatch = useCreateTax101Batch();

  const currentYear = new Date().getFullYear();
  const [taxYear, setTaxYear] = useState(currentYear + 1);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendInvites, setSendInvites] = useState(true);

  const departments = useMemo(() => {
    const set = new Set<string>();
    (employees as any[]).forEach((e) => e.department && set.add(e.department));
    return Array.from(set).sort();
  }, [employees]);

  const activeEmployees = useMemo(
    () => (employees as any[]).filter((e) => e.status === "active"),
    [employees],
  );

  const filtered = useMemo(() => {
    return activeEmployees.filter((e) => {
      if (departmentFilter !== "all" && e.department !== departmentFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return e.full_name?.toLowerCase().includes(s) || e.employee_code?.toLowerCase().includes(s);
      }
      return true;
    });
  }, [activeEmployees, search, departmentFilter]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((e) => next.delete(e.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((e) => next.add(e.id));
        return next;
      });
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0) {
      toast({ title: "לא נבחרו עובדים", variant: "destructive" });
      return;
    }
    try {
      await createBatch.mutateAsync({
        employeeIds: Array.from(selectedIds),
        taxYear,
        sendInvites,
      });
      toast({
        title: `נפתחו ${selectedIds.size} טפסים לשנת ${taxYear}`,
        description: sendInvites ? "נשלחו לינקים למייל לעובדים" : "העובדים יראו את הטופס בפורטל",
      });
      setSelectedIds(new Set());
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            פתיחת טופס 101 לחתימה
          </DialogTitle>
          <DialogDescription>
            בחר את שנת המס ואת העובדים שיתבקשו למלא ולחתום על הטופס.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>שנת מס</Label>
              <Input
                type="number"
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                min={2020}
                max={2100}
              />
            </div>
            <div className="space-y-1.5">
              <Label>סינון מחלקה</Label>
              <select
                className="w-full h-10 px-3 rounded-md bg-background border border-input text-sm"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
              >
                <option value="all">כל המחלקות</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש שם או קוד עובד..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 flex items-center justify-between text-xs">
              <label className="flex items-center gap-2">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} />
                בחר הכל ({filtered.length})
              </label>
              <span className="font-semibold">{selectedIds.size} נבחרו</span>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">אין עובדים תואמים</p>
              ) : (
                filtered.map((e) => (
                  <label key={e.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/30 cursor-pointer">
                    <Checkbox checked={selectedIds.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.employee_code} • {e.department}
                        {!e.email && <span className="text-warning"> • אין מייל</span>}
                      </p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={sendInvites} onCheckedChange={(v) => setSendInvites(!!v)} />
            שלח גם לינק במייל לעובדים נבחרים (אם קיים מייל)
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={createBatch.isPending} className="gap-1.5">
            {createBatch.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            פתח {selectedIds.size > 0 && `(${selectedIds.size})`} טפסים
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
