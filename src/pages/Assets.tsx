import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Search, Zap, MoreHorizontal, Package, UserRound, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAssets, useEmployees, useAssetCategories } from "@/hooks/useData";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { ImportAssetsExcelDialog } from "@/components/ImportAssetsExcelDialog";
import { QuickAssignDialog } from "@/components/QuickAssignDialog";
import CategoryManager from "@/pages/CategoryManager";
import { exportToExcel } from "@/lib/exportExcel";
import { DomainsGrid } from "@/components/assets/DomainsGrid";
import { CategoryAssetsList } from "@/components/assets/CategoryAssetsList";
import { AssetDetailView } from "@/components/assets/AssetDetailView";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};

export default function Assets() {
  const { data: assets } = useAssets();
  const { data: employees } = useEmployees();
  const { data: categories } = useAssetCategories();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const activeTab = searchParams.get("tab") === "categories" ? "categories" : "assets";
  const cat = searchParams.get("cat");
  const assetId = searchParams.get("asset");

  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState<string | undefined>(undefined);
  const [addTemplateName, setAddTemplateName] = useState<string | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);
  const globalSearch = searchParams.get("q") ?? "";
  const setGlobalSearch = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set("q", val);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  // ⌘K / Ctrl+K focuses the global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        searchInputRef.current?.blur();
        setSearchFocused(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Grouped global search results
  const searchResults = useMemo(() => {
    const empty = { assets: [] as any[], employees: [] as any[], categories: [] as any[] };
    if (!globalSearch.trim() || globalSearch.length < 2) return empty;
    const q = globalSearch.toLowerCase();
    return {
      assets: (assets ?? [])
        .filter((a: any) =>
          a.asset_name?.toLowerCase().includes(q) ||
          a.asset_code?.toLowerCase().includes(q) ||
          a.serial_number?.toLowerCase().includes(q) ||
          (a.custom_fields && JSON.stringify(a.custom_fields).toLowerCase().includes(q))
        )
        .slice(0, 6),
      employees: (employees ?? [])
        .filter((e: any) =>
          e.full_name?.toLowerCase().includes(q) ||
          e.employee_code?.toLowerCase().includes(q)
        )
        .slice(0, 4),
      categories: (categories ?? [])
        .filter((c: any) => c.category_name?.toLowerCase().includes(q))
        .slice(0, 4),
    };
  }, [assets, employees, categories, globalSearch]);

  const hasResults =
    searchResults.assets.length + searchResults.employees.length + searchResults.categories.length > 0;

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

        <TabsContent value="assets" className="space-y-5 mt-4">
          {/* Show global header only on level 1 */}
          {!cat && !assetId && (
            <>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="page-header">
                  <h1 className="page-title">משאבים</h1>
                  <p className="page-subtitle">חיפוש וניהול של כלל משאבי החברה — פריטים, עובדים, קטגוריות</p>
                </div>
              </div>

              {/* HERO search */}
              <div className="relative">
                <div
                  className={cn(
                    "flex items-center gap-3 bg-card border rounded-2xl px-4 py-3 transition-all",
                    searchFocused
                      ? "border-primary shadow-lg ring-2 ring-primary/15"
                      : "border-border shadow-sm hover:shadow"
                  )}
                >
                  <Search className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    aria-label="חיפוש גלובלי"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="חיפוש פריט, עובד או קטגוריה (שם / קוד / מס׳ סידורי / מס׳ פוליסה)..."
                    className="bg-transparent text-base outline-none w-full placeholder:text-muted-foreground/70"
                  />
                  <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-muted/50 text-[10px] font-mono text-muted-foreground shrink-0">
                    ⌘K
                  </kbd>

                  <div className="flex items-center gap-2 shrink-0 pl-2 border-r border-border pr-3">
                    <Button
                      size="sm"
                      className="gap-1.5 rounded-full"
                      onClick={() => { setAddCategoryId(undefined); setAddOpen(true); }}
                    >
                      <Plus className="w-4 h-4" />
                      פריט חדש
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-full"
                      onClick={() => setQuickAssignOpen(true)}
                    >
                      <Zap className="w-4 h-4" />
                      שיוך מהיר
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="px-2" aria-label="פעולות נוספות">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          disabled={!assets?.length}
                          onClick={() => {
                            if (!assets?.length) return;
                            exportToExcel(assets.map((a: any) => ({
                              ...a,
                              category_name: a.asset_categories?.category_name ?? "",
                              owner_name: a.employees?.full_name ?? "במלאי",
                              status_label: assetStatusLabels[a.status] ?? a.status,
                              expiry_fmt: a.expiry_date ? new Date(a.expiry_date).toLocaleDateString("en-GB") : "",
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
                          }}
                        >
                          ייצוא לאקסל
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setImportOpen(true)}>
                          ייבוא מאקסל
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSearchParams({ tab: "categories" })}>
                          ניהול קטגוריות
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Grouped results dropdown */}
                {searchFocused && globalSearch.length >= 2 && (
                  <div className="absolute z-30 mt-2 w-full bg-card border border-border rounded-2xl shadow-2xl overflow-hidden max-h-[70vh] overflow-y-auto">
                    {!hasResults ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        לא נמצאו תוצאות עבור "{globalSearch}"
                      </div>
                    ) : (
                      <>
                        {searchResults.assets.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              <Package className="w-3.5 h-3.5" />
                              פריטים <span className="font-normal">({searchResults.assets.length})</span>
                            </div>
                            {searchResults.assets.map((a: any) => (
                              <button
                                key={a.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  setGlobalSearch("");
                                  setSearchFocused(false);
                                  goToAsset(a.id, a.category_id);
                                }}
                                className="w-full text-right px-4 py-2.5 hover:bg-muted/60 flex items-center gap-3 text-sm border-t border-border/50"
                              >
                                <span className="font-mono text-xs text-muted-foreground shrink-0">{a.asset_code}</span>
                                <span className="flex-1 truncate font-medium">{a.asset_name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {a.asset_categories?.category_name}
                                </span>
                                {a.employees?.full_name && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                                    {a.employees.full_name}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.employees.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              <UserRound className="w-3.5 h-3.5" />
                              עובדים <span className="font-normal">({searchResults.employees.length})</span>
                            </div>
                            {searchResults.employees.map((e: any) => (
                              <button
                                key={e.id}
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  setGlobalSearch("");
                                  setSearchFocused(false);
                                  navigate(`/employees/${e.id}?tab=assets`);
                                }}
                                className="w-full text-right px-4 py-2.5 hover:bg-muted/60 flex items-center gap-3 text-sm border-t border-border/50"
                              >
                                <span className="font-mono text-xs text-muted-foreground shrink-0">{e.employee_code}</span>
                                <span className="flex-1 truncate font-medium">{e.full_name}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{e.role ?? ""}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {searchResults.categories.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              <FolderTree className="w-3.5 h-3.5" />
                              קטגוריות <span className="font-normal">({searchResults.categories.length})</span>
                            </div>
                            {searchResults.categories.map((c: any) => (
                              <button
                                key={c.id}
                                onMouseDown={(ev) => {
                                  ev.preventDefault();
                                  setGlobalSearch("");
                                  setSearchFocused(false);
                                  goToCategory(c.id);
                                }}
                                className="w-full text-right px-4 py-2.5 hover:bg-muted/60 flex items-center gap-3 text-sm border-t border-border/50"
                              >
                                <span className="font-mono text-xs text-muted-foreground shrink-0">{c.prefix}</span>
                                <span className="flex-1 truncate font-medium">{c.category_name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>


              <DomainsGrid
                onSelectCategory={goToCategory}
                onQuickAssign={() => setQuickAssignOpen(true)}
              />
            </>
          )}

          {cat && !assetId && (
            <CategoryAssetsList
              categoryId={cat}
              onBack={goToCategories}
              onSelectAsset={(id) => goToAsset(id)}
              onAddAsset={(categoryId, templateName) => { setAddCategoryId(categoryId); setAddTemplateName(templateName); setAddOpen(true); }}
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

      <AddAssetDialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setAddCategoryId(undefined); setAddTemplateName(undefined); } }} defaultCategoryId={addCategoryId} defaultAssetName={addTemplateName} />
      <ImportAssetsExcelDialog open={importOpen} onOpenChange={setImportOpen} />
      <QuickAssignDialog open={quickAssignOpen} onOpenChange={setQuickAssignOpen} />
    </div>
  );
}
