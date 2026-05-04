import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Boxes, Download, Upload, FileSignature, Trash2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAssets, useAssetCategories, useEmployees } from "@/hooks/useData";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useDeleteAsset } from "@/hooks/useMutations";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { EditAssetDialog } from "@/components/EditAssetDialog";
import { AssignAssetWithFormDialog } from "@/components/AssignAssetWithFormDialog";
import { ImportAssetsExcelDialog } from "@/components/ImportAssetsExcelDialog";
import CategoryManager from "@/pages/CategoryManager";
import { exportToExcel } from "@/lib/exportExcel";
import { useToast } from "@/hooks/use-toast";
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

export default function Assets() {
  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: employees } = useEmployees();
  const deleteMutation = useDeleteAsset();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<any>(null);
  const [assignAsset, setAssignAsset] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [unassignTarget, setUnassignTarget] = useState<any>(null);

  const filtered = (assets ?? []).filter((a) => {
    const matchCat = selectedCategory === "all" || a.category_id === selectedCategory;
    const matchSearch = a.asset_name.includes(search) || a.asset_code.includes(search) ||
      ((a as any).employees?.full_name ?? "").includes(search);
    return matchCat && matchSearch;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast({ title: "פריט נמחק בהצלחה" });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: "שגיאה במחיקה", description: err.message, variant: "destructive" });
    }
  };

  const handleUnassign = async () => {
    if (!unassignTarget) return;
    try {
      const { error } = await supabase
        .from("assets")
        .update({ current_owner_id: null, status: "in_stock" })
        .eq("id", unassignTarget.id);
      if (error) throw error;
      toast({ title: "השיוך בוטל", description: `${unassignTarget.asset_name} הוחזר למלאי` });
      qc.invalidateQueries({ queryKey: ["assets"] });
      setUnassignTarget(null);
    } catch (err: any) {
      toast({ title: "שגיאה בביטול שיוך", description: err.message, variant: "destructive" });
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "categories" ? "categories" : "assets";

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams(v === "assets" ? {} : { tab: v })} dir="rtl">
        <TabsList>
          <TabsTrigger value="assets">נכסים</TabsTrigger>
          <TabsTrigger value="categories">קטגוריות</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6 mt-4">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">נכסים וציוד</h1>
          <p className="page-subtitle">ניהול מלאי ומעקב אחר כלל ציוד החברה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => {
            if (!assets?.length) return;
            exportToExcel(assets.map(a => ({
              ...a,
              category_name: (a as any).asset_categories?.category_name ?? "",
              owner_name: (a as any).employees?.full_name ?? "במלאי",
              status_label: assetStatusLabels[a.status] ?? a.status,
              expiry_fmt: a.expiry_date ? new Date(a.expiry_date).toLocaleDateString("he-IL") : "",
            })), [
              { key: "asset_code", label: "מזהה" },
              { key: "asset_name", label: "שם פריט" },
              { key: "category_name", label: "קטגוריה" },
              { key: "serial_number", label: "מס׳ סידורי" },
              { key: "owner_name", label: "בעלות" },
              { key: "status_label", label: "סטטוס" },
              { key: "expiry_fmt", label: "תפוגה" },
              { key: "notes", label: "הערות" },
            ], "רשימת_ציוד");
          }}>
            <Download className="w-4 h-4" />
            ייצוא לאקסל
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" />
            יבוא מאקסל
          </Button>
          <Button className="gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4" />
            פריט חדש
          </Button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
            selectedCategory === "all"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          )}
        >
          <Boxes className="w-4 h-4" />
          הכל
          <span className={cn("text-xs px-1.5 py-0.5 rounded-md", selectedCategory === "all" ? "bg-primary-foreground/20" : "bg-muted")}>
            {assets?.length ?? 0}
          </span>
        </button>
        {(categories ?? []).map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors border",
              selectedCategory === cat.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {cat.category_name}
            <span className={cn("text-xs px-1.5 py-0.5 rounded-md", selectedCategory === cat.id ? "bg-primary-foreground/20" : "bg-muted")}>
              {(cat as any).assets?.[0]?.count ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-80">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש ציוד..."
          className="bg-transparent text-sm outline-none w-full"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">טוען...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>מזהה</th>
                <th>שם פריט</th>
                <th>קטגוריה</th>
                <th>בעלות</th>
                <th>סטטוס</th>
                <th>תפוגה</th>
                <th className="text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
                <tr
                  key={asset.id}
                  onClick={() => setEditAsset(asset)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <td className="font-mono text-xs text-muted-foreground">{asset.asset_code}</td>
                  <td className="font-medium">{asset.asset_name}</td>
                  <td>{(asset as any).asset_categories?.category_name ?? "—"}</td>
                  <td>{(asset as any).employees?.full_name ?? "במלאי"}</td>
                  <td>
                    <span className={`status-badge ${assetStatusClasses[asset.status] ?? ""}`}>
                      {assetStatusLabels[asset.status] ?? asset.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground text-xs">
                    {asset.expiry_date ? new Date(asset.expiry_date).toLocaleDateString("he-IL") : "—"}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="שיוך לעובד וחתימה"
                        onClick={(e) => { e.stopPropagation(); setAssignAsset(asset); }}
                      >
                        <FileSignature className="w-4 h-4 text-primary" />
                      </Button>
                      {asset.current_owner_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="ביטול שיוך — החזרה למלאי"
                          onClick={(e) => { e.stopPropagation(); setUnassignTarget(asset); }}
                        >
                          <UserMinus className="w-4 h-4 text-warning" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="מחיקה"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(asset); }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">לא נמצאו פריטים</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager />
        </TabsContent>
      </Tabs>

      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} />
      <ImportAssetsExcelDialog open={importOpen} onOpenChange={setImportOpen} />
      <EditAssetDialog
        open={!!editAsset}
        onOpenChange={(o) => !o && setEditAsset(null)}
        asset={editAsset}
      />
      <AssignAssetWithFormDialog
        open={!!assignAsset}
        onOpenChange={(o) => !o && setAssignAsset(null)}
        asset={assignAsset}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פריט ציוד</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את <strong>{deleteTarget?.asset_name}</strong> ({deleteTarget?.asset_code})?
              פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDelete}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!unassignTarget} onOpenChange={(o) => !o && setUnassignTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול שיוך</AlertDialogTitle>
            <AlertDialogDescription>
              האם לבטל את השיוך של <strong>{unassignTarget?.asset_name}</strong>{" "}
              ({unassignTarget?.asset_code}) מהעובד{" "}
              <strong>{(unassignTarget as any)?.employees?.full_name ?? "—"}</strong>?
              <br />
              הפריט יחזור למלאי.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassign}>בטל שיוך</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
