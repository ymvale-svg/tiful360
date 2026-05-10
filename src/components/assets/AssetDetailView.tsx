import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAssets, useAssetCategories, useEmployees } from "@/hooks/useData";
import { getCategoryIcon, getCategoryColor } from "@/lib/categoryIcons";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Pencil, FileSignature, UserMinus, Trash2, User, Building2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { EditAssetDialog } from "@/components/EditAssetDialog";
import { AssignAssetWithFormDialog } from "@/components/AssignAssetWithFormDialog";
import { AssetDocumentsSection } from "@/components/AssetDocumentsSection";
import { useDeleteAsset } from "@/hooks/useMutations";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};
const assetStatusClasses: Record<string, string> = {
  in_use: "status-active", in_stock: "status-onboarding", in_repair: "status-leaving", lost: "status-inactive",
};

interface Props {
  assetId: string;
  categoryId: string;
  onBack: () => void;
  onBackToCategories: () => void;
}

export function AssetDetailView({ assetId, categoryId, onBack, onBackToCategories }: Props) {
  const { data: assets } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: employees } = useEmployees();
  const deleteMutation = useDeleteAsset();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignConfirm, setUnassignConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const asset = (assets ?? []).find((a: any) => a.id === assetId) as any;
  const category = (categories ?? []).find((c: any) => c.id === categoryId) as any;

  // History from activity_log
  const { data: history } = useQuery({
    queryKey: ["asset-history", assetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "asset")
        .eq("entity_id", assetId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!assetId,
  });

  if (!asset) {
    return (
      <div className="space-y-4">
        <button onClick={onBackToCategories} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> חזרה לנכסים
        </button>
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">
          הפריט לא נמצא
        </div>
      </div>
    );
  }

  const isAssignable = category?.is_assignable !== false;
  const Icon = getCategoryIcon(category?.category_name);
  const color = getCategoryColor(category?.category_name);
  const expiry = asset.expiry_date ? new Date(asset.expiry_date) : null;
  const expired = expiry && expiry < new Date();

  const empMap = new Map((employees ?? []).map((e: any) => [e.id, e]));
  const owner = asset.current_owner_id ? empMap.get(asset.current_owner_id) as any : null;

  const handleUnassign = async () => {
    const { error } = await supabase
      .from("assets")
      .update({ current_owner_id: null, status: "in_stock" })
      .eq("id", assetId);
    if (error) {
      toast({ title: "שגיאה בביטול שיוך", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "השיוך בוטל", description: `${asset.asset_name} הוחזר למלאי` });
    qc.invalidateQueries({ queryKey: ["assets"] });
    setUnassignConfirm(false);
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(assetId);
      toast({ title: "פריט נמחק" });
      onBack();
    } catch (err: any) {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <button onClick={onBackToCategories} className="text-muted-foreground hover:text-foreground transition-colors">
          נכסים
        </button>
        <span className="text-muted-foreground">/</span>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          {category?.category_name}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{asset.asset_name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", color.bg, color.text)}>
            <Icon className="w-9 h-9" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {!isAssignable && <Building2 className="w-4 h-4 text-primary/70" />}
              {asset.asset_name}
            </h1>
            <p className="text-xs font-mono text-muted-foreground">{asset.asset_code}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAssignable && !asset.current_owner_id && (
            <Button onClick={() => setAssignOpen(true)} className="gap-2">
              <FileSignature className="w-4 h-4" />
              שיוך לעובד
            </Button>
          )}
          {isAssignable && asset.current_owner_id && (
            <>
              <Button variant="outline" onClick={() => setAssignOpen(true)} className="gap-2">
                <FileSignature className="w-4 h-4" />
                העברה
              </Button>
              <Button variant="outline" onClick={() => setUnassignConfirm(true)} className="gap-2">
                <UserMinus className="w-4 h-4" />
                ביטול שיוך
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setEditOpen(true)} className="gap-2">
            <Pencil className="w-4 h-4" />
            ערוך
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteConfirm(true)} title="מחק">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className={cn("grid gap-4", isAssignable ? "lg:grid-cols-3" : "grid-cols-1")}>
        {/* Asset details */}
        <div className={cn("space-y-4", isAssignable ? "lg:col-span-2" : "")}>
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">פרטי הנכס</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Field label="קטגוריה" value={category?.category_name} />
              <Field label="מזהה" value={asset.asset_code} mono />
              {asset.serial_number && <Field label="מס׳ סידורי" value={asset.serial_number} mono />}
              {asset.manufacturer_model && <Field label="יצרן/דגם" value={asset.manufacturer_model} />}
              {isAssignable && (
                <Field
                  label="סטטוס"
                  value={
                    <span className={cn("status-badge", assetStatusClasses[asset.status])}>
                      {assetStatusLabels[asset.status] ?? asset.status}
                    </span>
                  }
                />
              )}
              {asset.condition && <Field label="מצב" value={asset.condition} />}
              {expiry && (
                <Field
                  label="תפוגה"
                  value={
                    <span className={expired ? "text-destructive font-medium" : ""}>
                      {expiry.toLocaleDateString("en-GB").replace(/\//g, "-")}
                      {expired && " (פג)"}
                    </span>
                  }
                />
              )}
            </dl>

            {/* Custom fields */}
            {asset.custom_fields && Object.keys(asset.custom_fields).length > 0 && (
              <div className="pt-3 border-t border-border">
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">שדות נוספים</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {Object.entries(asset.custom_fields).map(([k, v]) => (
                    <Field key={k} label={k} value={String(v ?? "—")} />
                  ))}
                </dl>
              </div>
            )}

            {asset.notes && (
              <div className="pt-3 border-t border-border">
                <h3 className="text-xs font-semibold text-muted-foreground mb-1">הערות</h3>
                <p className="text-sm whitespace-pre-wrap">{asset.notes}</p>
              </div>
            )}
          </div>

          {/* Documents */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-muted-foreground mb-3">מסמכים מצורפים</h2>
            <AssetDocumentsSection assetId={assetId} />
          </div>
        </div>

        {/* Owner & history */}
        {isAssignable && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">בעלות נוכחית</h2>
              {owner ? (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{owner.full_name}</div>
                    {owner.role && <div className="text-xs text-muted-foreground truncate">{owner.role}</div>}
                    {owner.department && <div className="text-xs text-muted-foreground truncate">{owner.department}</div>}
                    {owner.email && <div className="text-xs text-muted-foreground truncate" dir="ltr">{owner.email}</div>}
                    {owner.phone && <div className="text-xs text-muted-foreground" dir="ltr">{owner.phone}</div>}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">הפריט במלאי — לא משויך לעובד.</p>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <History className="w-4 h-4" />
                היסטוריית הקצאות
              </h2>
              {!history || history.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין היסטוריה רשומה</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h: any) => {
                    const emp = h.employee_id ? empMap.get(h.employee_id) as any : null;
                    return (
                      <li key={h.id} className="text-xs border-r-2 border-border pr-3 py-1">
                        <div className="font-medium">{translateAction(h.action)}</div>
                        {emp && <div className="text-muted-foreground">{emp.full_name}</div>}
                        {h.details && <div className="text-muted-foreground line-clamp-2">{h.details}</div>}
                        <div className="text-muted-foreground">
                          {(() => { const d = new Date(h.created_at); const dd = String(d.getDate()).padStart(2,"0"); const mm = String(d.getMonth()+1).padStart(2,"0"); const hh = String(d.getHours()).padStart(2,"0"); const mi = String(d.getMinutes()).padStart(2,"0"); return `${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}`; })()}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <EditAssetDialog open={editOpen} onOpenChange={setEditOpen} asset={asset} />
      <AssignAssetWithFormDialog open={assignOpen} onOpenChange={setAssignOpen} asset={asset} />

      <AlertDialog open={unassignConfirm} onOpenChange={setUnassignConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול שיוך</AlertDialogTitle>
            <AlertDialogDescription>
              האם לבטל את השיוך של <strong>{asset.asset_name}</strong>?
              הפריט יחזור למלאי.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassign}>בטל שיוך</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פריט</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את <strong>{asset.asset_name}</strong>? פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium", mono && "font-mono text-xs")}>{value ?? "—"}</dd>
    </div>
  );
}

function translateAction(action: string): string {
  const map: Record<string, string> = {
    "asset.assign": "שיוך לעובד",
    "asset.unassign": "החזרה למלאי",
    "asset.transfer": "העברה",
    "asset.create": "יצירת פריט",
    "asset.update": "עדכון פרטים",
    "asset.delete": "מחיקה",
  };
  return map[action] ?? action;
}
