import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { useTransferAsset } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/ui/searchable-select";

const STOCK = "__stock__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: {
    id: string;
    asset_name: string;
    asset_code: string;
    current_owner_id: string | null;
  };
  currentOwnerName: string;
}

export function TransferAssetDialog({ open, onOpenChange, asset, currentOwnerName }: Props) {
  const { data: employees } = useEmployees();
  const mutation = useTransferAsset();
  const { toast } = useToast();
  // "" = nothing chosen yet; returning to stock must be picked explicitly, never a default.
  const [newOwnerId, setNewOwnerId] = useState("");
  const toStock = newOwnerId === STOCK;
  const [touched, setTouched] = useState(false);

  const close = (o: boolean) => {
    if (!o) { setNewOwnerId(""); setTouched(false); }
    onOpenChange(o);
  };

  const handleTransfer = async () => {
    if (!newOwnerId) { setTouched(true); return; }
    const targetEmployee = toStock ? undefined : employees?.find(e => e.id === newOwnerId);
    try {
      await mutation.mutateAsync({
        assetId: asset.id,
        newOwnerId: toStock ? null : newOwnerId,
        assetName: asset.asset_name,
        fromName: currentOwnerName || "מלאי",
        toName: targetEmployee?.full_name || "מלאי",
      });
      toast({ title: toStock ? "הפריט הוחזר למלאי" : "בעלות הועברה בהצלחה" });
      close(false);
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const availableEmployees = (employees ?? []).filter(
    e => (e.status === "active" || e.status === "onboarding") && e.id !== asset.current_owner_id
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-primary" />
            העברת בעלות
          </DialogTitle>
          <DialogDescription>
            העבר את {asset.asset_name} ({asset.asset_code}) לעובד אחר
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Current */}
          <div className="bg-muted rounded-lg p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">בעלות נוכחית</p>
              <p className="font-medium text-sm">{currentOwnerName || "במלאי"}</p>
            </div>
            <ArrowLeft className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            <div className="flex-1 text-left">
              <p className="text-xs text-muted-foreground">יעד חדש</p>
              <p className="font-medium text-sm">
                {toStock
                  ? "מלאי"
                  : newOwnerId
                    ? employees?.find(e => e.id === newOwnerId)?.full_name
                    : "טרם נבחר"}
              </p>
            </div>
          </div>

          <div role="group" aria-labelledby="transfer-target-label" data-invalid={touched && !newOwnerId ? "true" : undefined}>
            <span id="transfer-target-label" className="text-sm font-medium mb-1 block">יעד ההעברה</span>
            <SearchableSelect
              value={newOwnerId}
              onChange={(v) => { setNewOwnerId(v); setTouched(true); }}
              error={touched && !newOwnerId}
              options={[
                { value: STOCK, label: "החזר למלאי (ללא עובד)" },
                ...availableEmployees.map(e => ({
                  value: e.id,
                  label: `${e.full_name} (${e.employee_code}) — ${e.department}`,
                })),
              ]}
              placeholder="בחרו עובד או החזרה למלאי..."
            />
            {touched && !newOwnerId && <p role="alert" className="text-xs text-destructive mt-1">בחרו לאן להעביר את הפריט</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => close(false)}>ביטול</Button>
            <Button className="flex-1 gap-2" onClick={handleTransfer} disabled={mutation.isPending || !newOwnerId}>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              {mutation.isPending ? "מעביר..." : toStock ? "אשר החזרה למלאי" : "אשר העברה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
