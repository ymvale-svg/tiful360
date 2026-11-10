import { useState } from "react";
import { Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCreateVehicleRequest, useItemVehicleRequest, useVehicleTiers } from "@/hooks/useVehicles";
import { VehicleRequestDialog } from "@/components/vehicles/VehicleRequestDialog";
import { entitledTier, REQUEST_STATUS_LABEL } from "@/domain/vehicles/quotes";

interface Props {
  item: { id: string; notes: string | null };
  process: { company_id: string; employee_id: string; employees?: { role?: string | null; department?: string | null; start_date?: string | null } | null };
  /** The model HR picked in the form, as preferred model. */
  preferredModel?: string | null;
}

/** The car request behind a vehicle item in the onboarding checklist: open it, or follow it. */
export function VehicleItemAction({ item, process, preferredModel }: Props) {
  const { toast } = useToast();
  const { hasRole } = useAuth();
  const canManage = hasRole("admin") || hasRole("operations") || hasRole("finance");
  const { data: request, isLoading } = useItemVehicleRequest(item.id);
  const { data: tiers = [] } = useVehicleTiers();
  const create = useCreateVehicleRequest();
  const [open, setOpen] = useState(false);

  if (isLoading) return null;

  const start = async () => {
    const roles = tiers.flatMap((t) => (t.vehicle_tier_roles ?? []).map((r) => ({ ...r, tier_id: t.id })));
    try {
      await create.mutateAsync({
        company_id: process.company_id,
        employee_id: process.employee_id,
        onboarding_item_id: item.id,
        tier_id: entitledTier(roles, process.employees ?? {}),
        preferences: { models: preferredModel ? [preferredModel] : [], notes: item.notes },
        desired_date: process.employees?.start_date ?? null,
      });
      setOpen(true);
    } catch (e) {
      toast({ title: "בקשת הרכב לא נפתחה", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
      {request ? (
        <>
          <span className="text-muted-foreground">
            בקשת רכב: {REQUEST_STATUS_LABEL[request.status]} · {request.vehicle_quotes?.length ?? 0} הצעות
          </span>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Car className="w-4 h-4" /> לבקשת הרכב
          </Button>
        </>
      ) : canManage ? (
        <Button size="sm" variant="outline" onClick={() => { void start(); }} loading={create.isPending} loadingText="פותח…">
          <Car className="w-4 h-4" /> פתח בקשת רכב והצעות מחיר
        </Button>
      ) : (
        <span className="text-muted-foreground">בקשת הרכב תיפתח ע"י התפעול</span>
      )}
      <VehicleRequestDialog request={open ? request ?? null : null} onOpenChange={setOpen} />
    </div>
  );
}
