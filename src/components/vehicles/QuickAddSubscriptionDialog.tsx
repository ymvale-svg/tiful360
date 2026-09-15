import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAssetCategories, useAssets } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { useCreateAsset } from "@/hooks/useMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  employeeName: string;
  plate?: string;
}

/** Quick subscription creation — always lands in קטגוריה "שירותי מנוי" (דומיין רישיונות ותוכנות),
 *  as a regular asset assigned to the employee, so it stays a single source of truth. */
export function QuickAddSubscriptionDialog({ open, onOpenChange, employeeId, employeeName, plate }: Props) {
  const { toast } = useToast();
  const { data: categories } = useAssetCategories();
  const { data: groups } = useAssetGroups();
  const { data: assets } = useAssets();
  const createAsset = useCreateAsset();

  const category = useMemo(
    () => (categories ?? []).find((c: any) => c.prefix === "MAN" || (c.category_name ?? "").includes("שירותי מנוי")),
    [categories]
  );
  const subGroups = useMemo(
    () => (groups ?? []).filter((g) => g.category_id === category?.id),
    [groups, category]
  );

  const [groupId, setGroupId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [startDate, setStartDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setGroupId(subGroups[0]?.id ?? "");
      setCardNumber("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setNotes("");
    }
  }, [open, subGroups.length]);

  const selectedGroup = subGroups.find((g) => g.id === groupId);
  const isCard = (selectedGroup?.name ?? "").includes("תדלוק") || (selectedGroup?.name ?? "").includes("כרטיס");

  const nextCode = () => {
    const prefix = category?.prefix ?? "MAN";
    const re = new RegExp(`^${prefix}-(?:\\d{4}-)?(\\d+)$`);
    const max = (assets ?? []).reduce((m: number, a: any) => {
      const n = a.asset_code?.match(re);
      const v = n ? parseInt(n[1], 10) : 0;
      return v > m ? v : m;
    }, 0);
    const d = new Date();
    const token = `${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}`;
    return `${prefix}-${token}-${String(max + 1).padStart(3, "0")}`;
  };

  const submit = async () => {
    if (!category || !employeeId || !selectedGroup) return;
    try {
      await createAsset.mutateAsync({
        asset_code: nextCode(),
        asset_name: selectedGroup.name,
        category_id: category.id,
        group_id: selectedGroup.id,
        current_owner_id: employeeId,
        status: "in_use",
        serial_number: isCard && cardNumber.trim() ? cardNumber.trim() : undefined,
        expiry_date: undefined,
        notes: [startDate ? `תאריך התחלה- ${startDate}` : "", plate ? `רכב- ${plate}` : "", notes.trim()]
          .filter(Boolean)
          .join("\n") || undefined,
      });
      toast({ title: "המנוי נוסף", description: `${selectedGroup.name} · ${employeeName}` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "שגיאה בהוספת המנוי", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>הוספת מנוי מהירה</DialogTitle>
          <DialogDescription>
            {employeeName}
            {plate && plate !== "—" ? ` · רכב ${plate}` : ""} — המנוי נשמר תחת רישיונות ותוכנות ‹ שירותי מנוי
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>סוג המנוי</Label>
            <select
              className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {subGroups.length === 0 && <option value="">לא הוגדרו שירותי מנוי</option>}
              {subGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {isCard && (
            <div className="space-y-1.5">
              <Label>מס' כרטיס</Label>
              <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="מספר כרטיס תדלוק" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>תאריך התחלה</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>הערות</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="אופציונלי" />
          </div>
        </div>

        <div className="flex justify-start gap-2 pt-2">
          <Button onClick={submit} disabled={!groupId || !employeeId || createAsset.isPending}>
            {createAsset.isPending ? "מוסיף..." : "הוסף מנוי"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
