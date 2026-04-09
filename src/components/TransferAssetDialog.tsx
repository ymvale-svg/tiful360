import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { useTransferAsset } from "@/hooks/useMutations";
import { useEmployees } from "@/hooks/useData";
import { useToast } from "@/hooks/use-toast";

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
  const [newOwnerId, setNewOwnerId] = useState("");

  const handleTransfer = async () => {
    const targetEmployee = employees?.find(e => e.id === newOwnerId);
    try {
      await mutation.mutateAsync({
        assetId: asset.id,
        newOwnerId: newOwnerId || null,
        assetName: asset.asset_name,
        fromName: currentOwnerName || "מלאי",
        toName: targetEmployee?.full_name || "מלאי",
      });
      toast({ title: "בעלות הועברה בהצלחה" });
      onOpenChange(false);
      setNewOwnerId("");
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
  };

  const availableEmployees = (employees ?? []).filter(
    e => (e.status === "active" || e.status === "onboarding") && e.id !== asset.current_owner_id
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1 text-left">
              <p className="text-xs text-muted-foreground">יעד חדש</p>
              <p className="font-medium text-sm">
                {newOwnerId
                  ? employees?.find(e => e.id === newOwnerId)?.full_name
                  : "בחר עובד..."}
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">העבר לעובד</label>
            <select
              value={newOwnerId}
              onChange={(e) => setNewOwnerId(e.target.value)}
              className="w-full px-3 py-2.5 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">החזר למלאי</option>
              {availableEmployees.map(e => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_code}) — {e.department}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>ביטול</Button>
            <Button className="flex-1 gap-2" onClick={handleTransfer} disabled={mutation.isPending}>
              <RefreshCw className="w-4 h-4" />
              {mutation.isPending ? "מעביר..." : "אשר העברה"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
