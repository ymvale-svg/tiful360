import { useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Zap, Plus, X, ArrowLeft, Package } from "lucide-react";
import { useEmployees, useAssets } from "@/hooks/useData";
import { HandoverFlow } from "@/components/handover/HandoverFlow";
import { MultiHandoverFlow } from "@/components/handover/MultiHandoverFlow";
import { IconButton } from "@/components/feedback/IconButton";
import { getDomain } from "@/lib/assetDomains";
import { advanceQueue, closeFollowsAssign } from "@/lib/quickAssignQueue";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAssignDialog({ open, onOpenChange }: Props) {
  const { data: employees } = useEmployees();
  const { data: assets } = useAssets();

  const [employeeId, setEmployeeId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [picker, setPicker] = useState("");
  const [queueIndex, setQueueIndex] = useState<number | null>(null);
  const [multiOpen, setMultiOpen] = useState(false);

  const reset = () => {
    setEmployeeId("");
    setSelectedIds([]);
    setPicker("");
    setQueueIndex(null);
    setMultiOpen(false);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const empOptions = useMemo(
    () =>
      (employees ?? []).map((e: any) => ({
        value: e.id,
        label: `${e.full_name}${e.employee_code ? ` · ${e.employee_code}` : ""}`,
      })),
    [employees],
  );

  const employee = (employees ?? []).find((e: any) => e.id === employeeId);

  const availableAssets = useMemo(() => {
    return (assets ?? []).filter((a: any) => {
      if (selectedIds.includes(a.id)) return false;
      const status = a.status;
      const owned = !!a.current_owner_id;
      // Allow items in stock; if employee scoped to a company, only same company
      if (employee?.company_id && a.company_id && a.company_id !== employee.company_id) return false;
      return !owned && (status === "available" || status === "in_stock" || !status);
    });
  }, [assets, selectedIds, employee]);

  const assetOptions = useMemo(
    () =>
      availableAssets.map((a: any) => ({
        value: a.id,
        label: `${a.asset_name} (${a.asset_code})${a.asset_categories?.category_name ? ` — ${a.asset_categories.category_name}` : ""}`,
      })),
    [availableAssets],
  );

  const selectedAssets = useMemo(
    () => selectedIds.map((id) => (assets ?? []).find((a: any) => a.id === id)).filter(Boolean),
    [selectedIds, assets],
  );

  const addSelected = () => {
    if (!picker) return;
    setSelectedIds((prev) => Array.from(new Set([...prev, picker])));
    setPicker("");
  };

  const removeSelected = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const canStart = !!employeeId && selectedIds.length > 0;

  // Items from one domain share a single protocol (one signature); mixed domains need one each.
  const singleDomain = selectedAssets.length > 1
    && new Set(selectedAssets.map((a: any) => getDomain(a.asset_categories))).size === 1;

  const startQueue = () => {
    if (singleDomain) setMultiOpen(true);
    else setQueueIndex(0);
  };

  // HandoverFlow calls onAssigned() and then closes itself; that close must
  // not abort the rest of the batch.
  const justAssignedRef = useRef(false);

  const handleAssigned = () => {
    justAssignedRef.current = true;
    const step = advanceQueue(queueIndex, selectedIds.length);
    setQueueIndex(step.next);
    if (step.done) setTimeout(() => handleOpenChange(false), 0);
  };

  const currentAsset =
    queueIndex !== null ? (selectedAssets[queueIndex] as any) ?? null : null;

  return (
    <>
      <Dialog open={open && queueIndex === null && !multiOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              שיוך מהיר לעובד
            </DialogTitle>
            <DialogDescription>
              בחרו עובד ופריט אחד או יותר. פריטים מאותו תחום נמסרים בפרוטוקול אחד; פריטים מתחומים שונים — פרוטוקול לכל פריט.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div role="group" aria-labelledby="qa-employee-label">
              <span id="qa-employee-label" className="text-sm font-medium mb-1 block">עובד מקבל</span>
              <SearchableSelect
                value={employeeId}
                onChange={(v) => {
                  setEmployeeId(v);
                  setSelectedIds([]);
                }}
                options={empOptions}
                placeholder="בחר עובד..."
                searchPlaceholder="חיפוש לפי שם או קוד..."
              />
            </div>

            <div role="group" aria-labelledby="qa-items-label">
              <span id="qa-items-label" className="text-sm font-medium mb-1 block">פריטים לשיוך</span>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={picker}
                    onChange={setPicker}
                    options={assetOptions}
                    placeholder={employeeId ? "בחר פריט מהמלאי..." : "בחרו עובד תחילה"}
                    searchPlaceholder="חיפוש לפי שם / קוד / קטגוריה..."
                    emptyText="אין פריטים זמינים"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSelected}
                  disabled={!picker}
                  className="shrink-0 gap-1"
                >
                  <Plus className="w-4 h-4" />
                  הוסף
                </Button>
              </div>

              {selectedAssets.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {selectedAssets.map((a: any) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-sm"
                    >
                      <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="font-mono text-xs text-muted-foreground shrink-0">
                        {a.asset_code}
                      </span>
                      <span className="flex-1 truncate">{a.asset_name}</span>
                      {a.asset_categories?.category_name && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {a.asset_categories.category_name}
                        </span>
                      )}
                      <IconButton
                        type="button"
                        label={`הסר את ${a.asset_name}`}
                        onClick={() => removeSelected(a.id)}
                        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                ביטול
              </Button>
              <Button onClick={startQueue} disabled={!canStart} className="gap-1.5">
                המשך לשיוך
                {selectedIds.length > 0 && (
                  <span className="text-xs opacity-80">({selectedIds.length})</span>
                )}
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {currentAsset && queueIndex !== null && (
        <HandoverFlow
          key={currentAsset.id}
          open={true}
          onOpenChange={(o) => {
            if (!o) {
              const justAssigned = justAssignedRef.current;
              justAssignedRef.current = false;
              if (closeFollowsAssign(justAssigned) === "ignore") return;
              // User cancelled mid-queue — abort the whole batch
              setQueueIndex(null);
              handleOpenChange(false);
            }
          }}
          asset={currentAsset}
          defaultEmployeeId={employeeId}
          onAssigned={handleAssigned}
        />
      )}

      {multiOpen && (
        <MultiHandoverFlow
          open={true}
          onOpenChange={(o) => {
            // Cancelling the protocol returns to the selection, keeping the chosen items.
            if (!o) setMultiOpen(false);
          }}
          assets={selectedAssets as any[]}
          defaultEmployeeId={employeeId}
          onAssigned={() => setTimeout(() => handleOpenChange(false), 0)}
        />
      )}

      {queueIndex !== null && selectedIds.length > 1 && (
        <div className="fixed bottom-4 left-4 z-[60] rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-xs shadow-lg pointer-events-none">
          פריט {queueIndex + 1} מתוך {selectedIds.length}
        </div>
      )}
    </>
  );
}
