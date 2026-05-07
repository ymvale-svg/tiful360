import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Download, Upload, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAssets } from "@/hooks/useData";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { ImportAssetsExcelDialog } from "@/components/ImportAssetsExcelDialog";
import CategoryManager from "@/pages/CategoryManager";
import { exportToExcel } from "@/lib/exportExcel";
import { CategoriesGrid } from "@/components/assets/CategoriesGrid";
import { CategoryAssetsList } from "@/components/assets/CategoryAssetsList";
import { AssetDetailView } from "@/components/assets/AssetDetailView";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};

export default function Assets() {
  const { data: assets } = useAssets();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") === "categories" ? "categories" : "assets";
  const cat = searchParams.get("cat");
  const assetId = searchParams.get("asset");

  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const globalSearch = searchParams.get("q") ?? "";
  const setGlobalSearch = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set("q", val);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  // Global search results — show as quick navigation
  const searchResults = useMemo(() => {
    if (!globalSearch.trim() || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase();
    return (assets ?? [])
      .filter((a: any) =>
        a.asset_name?.toLowerCase().includes(q) ||
        a.asset_code?.toLowerCase().includes(q) ||
        a.serial_number?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [assets, globalSearch]);

  const updateParams = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    setSearchParams(params);
  };

  const goToCategories = () => updateParams({ cat: null, asset: null });
  const goToCategory = (id: string) => updateParams({ cat: id, asset: null });
  const goToAsset = (id: string, categoryId?: string) =>
    updateParams({ cat: categoryId ?? cat, asset: id });

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <Tabs value={activeTab} onValueChange={(v) => setSearchParams(v === "assets" ? {} : { tab: v })} dir="rtl">
        <TabsList>
          <TabsTrigger value="assets">משאבים</TabsTrigger>
          <TabsTrigger value="categories">קטגוריות</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6 mt-4">
          {/* Show global header only on level 1 */}
          {!cat && !assetId && (
            <>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="page-header">
                  <h1 className="page-title">משאבים</h1>
                  <p className="page-subtitle">ניהול מלאי ומעקב אחר כלל משאבי החברה</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="gap-2" onClick={() => {
                    if (!assets?.length) return;
                    exportToExcel(assets.map((a: any) => ({
                      ...a,
                      category_name: a.asset_categories?.category_name ?? "",
                      owner_name: a.employees?.full_name ?? "במלאי",
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
                  <Button className="gap-2" onClick={() => { setAddCategoryId(undefined); setAddOpen(true); }}>
                    <Plus className="w-4 h-4" />
                    פריט חדש
                  </Button>
                </div>
              </div>

              {/* Global search */}
              <div className="relative max-w-xl">
                <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    placeholder="חיפוש מהיר בכל המשאבים (שם / מזהה / מס׳ סידורי)..."
                    className="bg-transparent text-sm outline-none w-full"
                  />
                </div>
                {searchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                    {searchResults.map((a: any) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setGlobalSearch("");
                          goToAsset(a.id, a.category_id);
                        }}
                        className="w-full text-right px-3 py-2 hover:bg-muted/60 flex items-center gap-3 text-sm"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{a.asset_code}</span>
                        <span className="flex-1 truncate">{a.asset_name}</span>
                        <span className="text-xs text-muted-foreground">{a.asset_categories?.category_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <CategoriesGrid onSelectCategory={goToCategory} />
            </>
          )}

          {cat && !assetId && (
            <CategoryAssetsList
              categoryId={cat}
              onBack={goToCategories}
              onSelectAsset={(id) => goToAsset(id)}
              onAddAsset={() => { setAddCategoryId(cat); setAddOpen(true); }}
            />
          )}

          {cat && assetId && (
            <AssetDetailView
              assetId={assetId}
              categoryId={cat}
              onBack={() => goToCategory(cat)}
              onBackToCategories={goToCategories}
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager />
        </TabsContent>
      </Tabs>

      <AddAssetDialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) setAddCategoryId(undefined); }} defaultCategoryId={addCategoryId} />
      <ImportAssetsExcelDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
