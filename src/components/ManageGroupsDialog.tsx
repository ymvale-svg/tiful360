import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Pencil, Check, X, ChevronRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAssets } from "@/hooks/useData";
import {
  useAssetGroups,
  useCreateAssetGroup,
  useUpdateAssetGroup,
  useDeleteAssetGroup,
  useAssignAssetsToGroup,
} from "@/hooks/useAssetGroups";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categoryId: string;
  categoryName: string;
}

export function ManageGroupsDialog({ open, onOpenChange, categoryId, categoryName }: Props) {
  const { data: assets } = useAssets();
  const { data: groups } = useAssetGroups();
  const createGroup = useCreateAssetGroup();
  const updateGroup = useUpdateAssetGroup();
  const deleteGroup = useDeleteAssetGroup();
  const assignAssets = useAssignAssetsToGroup();
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const catGroups = useMemo(
    () => (groups ?? []).filter((g) => g.category_id === categoryId),
    [groups, categoryId],
  );
  const catAssets = useMemo(
    () => (assets ?? []).filter((a: any) => a.category_id === categoryId),
    [assets, categoryId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedGroupId(null);
      setNewName("");
      setEditingId(null);
    }
  }, [open]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const g = await createGroup.mutateAsync({ category_id: categoryId, name });
      setNewName("");
      setSelectedGroupId(g.id);
      toast({ title: "המשפחה נוצרה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateGroup.mutateAsync({ id, name });
      setEditingId(null);
      toast({ title: "עודכן" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("למחוק את המשפחה? הפריטים יוסרו מהמשפחה אך לא יימחקו.")) return;
    try {
      await deleteGroup.mutateAsync(id);
      if (selectedGroupId === id) setSelectedGroupId(null);
      toast({ title: "המשפחה נמחקה" });
    } catch (e: any) {
      toast({ title: "שגיאה", description: e.message, variant: "destructive" });
    }
  };

  const inGroup = useMemo(
    () => catAssets.filter((a: any) => a.group_id === selectedGroupId),
    [catAssets, selectedGroupId],
  );
  const outGroup = useMemo(
    () => catAssets.filter((a: any) => a.group_id !== selectedGroupId),
    [catAssets, selectedGroupId],
  );

  const moveToGroup = async (assetId: string) => {
    if (!selectedGroupId) return;
    await assignAssets.mutateAsync({ groupId: selectedGroupId, assetIds: [assetId] });
  };
  const removeFromGroup = async (assetId: string) => {
    await assignAssets.mutateAsync({ groupId: null, assetIds: [assetId] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>ניהול משפחות · {categoryName}</DialogTitle>
          <DialogDescription>
            הגדר משפחות לאיחוד פריטים זהים תחת כרטיס-אב אחד (לחיצה תפתח רשימה של כל הפריטים).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Groups list */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">משפחות</div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="שם משפחה חדשה"
                className="flex-1 px-3 py-2 bg-muted rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || createGroup.isPending}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-1 max-h-80 overflow-y-auto">
              {catGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center border border-dashed rounded-lg">
                  אין עדיין משפחות
                </p>
              ) : (
                catGroups.map((g) => {
                  const count = catAssets.filter((a: any) => a.group_id === g.id).length;
                  const active = selectedGroupId === g.id;
                  const isEditing = editingId === g.id;
                  return (
                    <div
                      key={g.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 border",
                        active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                      )}
                    >
                      {isEditing ? (
                        <>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 px-2 py-1 bg-background rounded text-sm outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                          />
                          <button onClick={() => handleRename(g.id)} className="text-primary p-1">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-muted-foreground p-1">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setSelectedGroupId(g.id)}
                            className="flex-1 text-right text-sm flex items-center gap-2 min-w-0"
                          >
                            <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate">{g.name}</span>
                            <span className="text-[11px] text-muted-foreground">({count})</span>
                          </button>
                          <button
                            onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="ערוך שם"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(g.id)}
                            className="text-muted-foreground hover:text-destructive p-1"
                            title="מחק"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Items panel */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              {selectedGroupId ? "פריטים במשפחה" : "בחר משפחה כדי לשייך פריטים"}
            </div>
            {selectedGroupId ? (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">במשפחה ({inGroup.length})</div>
                  {inGroup.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground p-2 border border-dashed rounded">אין פריטים</p>
                  ) : (
                    <ul className="space-y-1">
                      {inGroup.map((a: any) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-primary/5 rounded text-sm">
                          <span className="truncate">{a.asset_name} · <span className="font-mono text-[11px]">{a.asset_code}</span></span>
                          <button onClick={() => removeFromGroup(a.id)} className="text-muted-foreground hover:text-destructive shrink-0" title="הסר מהמשפחה">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">פריטים זמינים ({outGroup.length})</div>
                  {outGroup.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground p-2 border border-dashed rounded">אין פריטים נוספים</p>
                  ) : (
                    <ul className="space-y-1">
                      {outGroup.map((a: any) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 px-2 py-1.5 hover:bg-muted/50 rounded text-sm">
                          <span className="truncate">
                            {a.asset_name} · <span className="font-mono text-[11px]">{a.asset_code}</span>
                            {a.group_id && <span className="text-[10px] text-muted-foreground mr-1">(במשפחה אחרת)</span>}
                          </span>
                          <button onClick={() => moveToGroup(a.id)} className="text-primary hover:underline text-[11px] shrink-0">
                            הוסף
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground p-6 text-center border border-dashed rounded-lg">
                <ChevronRight className="w-4 h-4 mx-auto mb-2 opacity-50" />
                בחר משפחה מימין
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>סגור</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
