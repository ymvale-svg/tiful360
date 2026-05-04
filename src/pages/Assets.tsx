import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Boxes, Download, Upload, FileSignature, Trash2, UserMinus, User, Building2, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "allocated" | "institutional">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<any>(null);
  const [assignAsset, setAssignAsset] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [unassignTarget, setUnassignTarget] = useState<any>(null);

  // Grouping & sorting
  type GroupBy = "category" | "employee" | "none";
  type SortKey = "asset_code" | "asset_name" | "category" | "owner" | "status" | "expiry";
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [sortKey, setSortKey] = useState<SortKey>("asset_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // When user picks a specific category — switch grouping to employee automatically
  const effectiveGroupBy: GroupBy = selectedCategory !== "all" && groupBy === "category" ? "employee" : groupBy;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k
      ? <ArrowUpDown className="w-3 h-3 inline opacity-40 mr-1" />
      : sortDir === "asc"
        ? <ArrowUp className="w-3 h-3 inline mr-1" />
        : <ArrowDown className="w-3 h-3 inline mr-1" />;

  const cmp = (a: any, b: any, key: SortKey): number => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = (() => {
      switch (key) {
        case "asset_code": return a.asset_code ?? "";
        case "asset_name": return a.asset_name ?? "";
        case "category": return a.asset_categories?.category_name ?? "";
        case "owner": return a.employees?.full_name ?? "\uFFFF"; // unassigned last on asc
        case "status": return assetStatusLabels[a.status] ?? a.status ?? "";
        case "expiry": return a.expiry_date ?? "";
      }
    })();
    const bv = (() => {
      switch (key) {
        case "asset_code": return b.asset_code ?? "";
        case "asset_name": return b.asset_name ?? "";
        case "category": return b.asset_categories?.category_name ?? "";
        case "owner": return b.employees?.full_name ?? "\uFFFF";
        case "status": return assetStatusLabels[b.status] ?? b.status ?? "";
        case "expiry": return b.expiry_date ?? "";
      }
    })();
    return String(av).localeCompare(String(bv), "he", { numeric: true, sensitivity: "base" }) * dir;
  };

  const filtered = (assets ?? []).filter((a) => {
    const isAssignable = (a as any).asset_categories?.is_assignable !== false;
    const matchScope =
      scope === "all" ||
      (scope === "allocated" && isAssignable) ||
      (scope === "institutional" && !isAssignable);
    const matchCat = selectedCategory === "all" || a.category_id === selectedCategory;
    const matchEmp =
      selectedEmployee === "all" ||
      (selectedEmployee === "__unassigned__" ? !a.current_owner_id : a.current_owner_id === selectedEmployee);
    const matchStatus = selectedStatus === "all" || a.status === selectedStatus;
    const matchSearch = a.asset_name.includes(search) || a.asset_code.includes(search) ||
      ((a as any).employees?.full_name ?? "").includes(search);
    return matchScope && matchCat && matchEmp && matchStatus && matchSearch;
  });

  // Sort the filtered list by current sort key
  const sorted = [...filtered].sort((a, b) => cmp(a, b, sortKey));

  // Group rows
  const groups: Array<{ key: string; label: string; items: any[] }> = (() => {
    if (effectiveGroupBy === "none") {
      return [{ key: "__all__", label: "", items: sorted }];
    }
    const map = new Map<string, { key: string; label: string; items: any[] }>();
    for (const a of sorted) {
      let key: string; let label: string;
      if (effectiveGroupBy === "category") {
        key = (a as any).category_id ?? "__none__";
        label = (a as any).asset_categories?.category_name ?? "ללא קטגוריה";
      } else {
        key = (a as any).current_owner_id ?? "__stock__";
        label = (a as any).employees?.full_name ?? "במלאי / ללא שיוך";
      }
      if (!map.has(key)) map.set(key, { key, label, items: [] });
      map.get(key)!.items.push(a);
    }
    // Sort groups: stock/none last when ascending
    return Array.from(map.values()).sort((g1, g2) => {
      const sentinel = (k: string) => k === "__stock__" || k === "__none__" ? 1 : 0;
      const s = sentinel(g1.key) - sentinel(g2.key);
      if (s !== 0) return s;
      return g1.label.localeCompare(g2.label, "he", { numeric: true });
    });
  })();

  // Summary stats
  const statusCounts = filtered.reduce((acc: Record<string, number>, a: any) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1; return acc;
  }, {});

  // Categories that match the current scope (so the pill row narrows correctly)
  const visibleCategories = (categories ?? []).filter((c: any) => {
    if (scope === "allocated") return c.is_assignable !== false;
    if (scope === "institutional") return c.is_assignable === false;
    return true;
  });

  const allocatedCount = (assets ?? []).filter((a: any) => (a as any).asset_categories?.is_assignable !== false).length;
  const institutionalCount = (assets ?? []).filter((a: any) => (a as any).asset_categories?.is_assignable === false).length;

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

      {/* Scope tabs: Allocated vs Institutional */}
      <div className="flex items-center gap-2">
        {[
          { value: "all", label: "הכל", icon: Boxes, count: assets?.length ?? 0 },
          { value: "allocated", label: "מוקצים לעובדים", icon: User, count: allocatedCount },
          { value: "institutional", label: "נכסי חברה", icon: Building2, count: institutionalCount },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => { setScope(s.value as any); setSelectedCategory("all"); }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
              scope === s.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            <s.icon className="w-4 h-4" />
            {s.label}
            <span className={cn("text-xs px-1.5 py-0.5 rounded-md", scope === s.value ? "bg-primary-foreground/20" : "bg-muted")}>
              {s.count}
            </span>
          </button>
        ))}
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
            selectedCategory === "all"
              ? "bg-secondary text-secondary-foreground border-secondary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          )}
        >
          כל הקטגוריות
        </button>
        {visibleCategories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors border",
              selectedCategory === cat.id
                ? "bg-secondary text-secondary-foreground border-secondary"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {cat.category_name}
            <span className={cn("text-xs px-1.5 py-0.5 rounded-md", selectedCategory === cat.id ? "bg-secondary-foreground/20" : "bg-muted")}>
              {(cat as any).assets?.[0]?.count ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search & filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-80">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש פריט / מזהה..."
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>
        {scope !== "institutional" && (
          <div className="w-72">
            <SearchableSelect
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              placeholder="סינון לפי עובד"
              searchPlaceholder="חיפוש עובד..."
              options={[
                { value: "all", label: "כל העובדים" },
                { value: "__unassigned__", label: "במלאי (ללא שיוך)" },
                ...((employees ?? []).map((e: any) => ({
                  value: e.id,
                  label: `${e.full_name}${e.department ? ` — ${e.department}` : ""}`,
                }))),
              ]}
            />
          </div>
        )}
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm outline-none"
        >
          <option value="all">כל הסטטוסים</option>
          <option value="in_use">בשימוש</option>
          <option value="in_stock">במלאי</option>
          <option value="in_repair">בתיקון</option>
          <option value="lost">אבד</option>
        </select>

        {/* Group-by toggle */}
        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          <span className="text-xs text-muted-foreground px-2">קיבוץ:</span>
          {([
            { v: "category", l: "קטגוריה" },
            { v: "employee", l: "עובד" },
            { v: "none", l: "ללא" },
          ] as Array<{ v: GroupBy; l: string }>).map((g) => (
            <button
              key={g.v}
              onClick={() => setGroupBy(g.v)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                groupBy === g.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {g.l}
            </button>
          ))}
        </div>

        {(selectedEmployee !== "all" || selectedCategory !== "all" || selectedStatus !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSelectedEmployee("all"); setSelectedCategory("all"); setSelectedStatus("all"); setSearch(""); }}
          >
            נקה סינון
          </Button>
        )}
      </div>

      {/* Summary bar */}
      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
        <span>מציג <strong className="text-foreground">{filtered.length}</strong> מתוך {assets?.length ?? 0} פריטים</span>
        {Object.entries(statusCounts).map(([k, v]) => (
          <span key={k}>· {assetStatusLabels[k] ?? k}: <strong className="text-foreground">{v}</strong></span>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">טוען...</div>
        ) : (
          <table className="data-table">
            <thead className="sticky top-0 bg-card z-10">
              <tr>
                <th onClick={() => toggleSort("asset_code")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="asset_code" />מזהה</th>
                <th onClick={() => toggleSort("asset_name")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="asset_name" />שם פריט</th>
                <th onClick={() => toggleSort("category")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="category" />קטגוריה</th>
                <th onClick={() => toggleSort("owner")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="owner" />בעלות</th>
                <th onClick={() => toggleSort("status")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="status" />סטטוס</th>
                <th onClick={() => toggleSort("expiry")} className="cursor-pointer select-none hover:bg-muted/40"><SortIcon k="expiry" />תפוגה</th>
                <th className="text-left">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((grp) => {
                const isCollapsed = !!collapsed[grp.key];
                const showHeader = effectiveGroupBy !== "none";
                return (
                  <React.Fragment key={grp.key}>
                    {showHeader && (
                      <tr
                        key={`hdr-${grp.key}`}
                        className="bg-muted/40 hover:bg-muted/60 cursor-pointer sticky"
                        onClick={() => setCollapsed((c) => ({ ...c, [grp.key]: !c[grp.key] }))}
                      >
                        <td colSpan={7} className="font-semibold text-sm py-2">
                          <div className="flex items-center gap-2">
                            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            <span>{grp.label}</span>
                            <span className="text-xs text-muted-foreground font-normal">· {grp.items.length}</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!isCollapsed && grp.items.map((asset: any) => {
                      const cat = asset.asset_categories;
                      const categoryName = cat?.category_name ?? "";
                      const isAssignable = cat?.is_assignable !== false;
                      const isVirtualAsset = cat?.skip_handover_form === true || /תוכנ|וירטואל|software|virtual|subscription|מנוי/i.test(categoryName);
                      return (
                        <tr
                          key={asset.id}
                          onClick={() => setEditAsset(asset)}
                          className="cursor-pointer hover:bg-muted/40 transition-colors"
                        >
                          <td className="font-mono text-xs text-muted-foreground">{asset.asset_code}</td>
                          <td className="font-medium">
                            <div className="flex items-center gap-2">
                              {!isAssignable && (
                                <Building2 className="w-3.5 h-3.5 text-primary/70 shrink-0" aria-label="נכס חברה" />
                              )}
                              {asset.asset_name}
                            </div>
                          </td>
                          <td>{categoryName || "—"}</td>
                          <td>
                            {isAssignable
                              ? (asset.employees?.full_name ?? "במלאי")
                              : <span className="text-xs text-muted-foreground">נכס חברה</span>}
                          </td>
                          <td>
                            {isAssignable ? (
                              <span className={`status-badge ${assetStatusClasses[asset.status] ?? ""}`}>
                                {assetStatusLabels[asset.status] ?? asset.status}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="text-muted-foreground text-xs">
                            {asset.expiry_date ? new Date(asset.expiry_date).toLocaleDateString("he-IL") : "—"}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {isAssignable && !isVirtualAsset && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="שיוך לעובד וחתימה"
                                  onClick={(e) => { e.stopPropagation(); setAssignAsset(asset); }}>
                                  <FileSignature className="w-4 h-4 text-primary" />
                                </Button>
                              )}
                              {isAssignable && asset.current_owner_id && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="ביטול שיוך — החזרה למלאי"
                                  onClick={(e) => { e.stopPropagation(); setUnassignTarget(asset); }}>
                                  <UserMinus className="w-4 h-4 text-warning" />
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="מחיקה"
                                onClick={(e) => { e.stopPropagation(); setDeleteTarget(asset); }}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
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
