import { useState } from "react";
import { Search, Plus, Eye, MoreHorizontal, Boxes, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { AddAssetDialog } from "@/components/AddAssetDialog";
import { ImportAssetsExcelDialog } from "@/components/ImportAssetsExcelDialog";
import { exportToExcel } from "@/lib/exportExcel";

const assetStatusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};
const assetStatusClasses: Record<string, string> = {
  in_use: "status-active", in_stock: "status-onboarding", in_repair: "status-leaving", lost: "status-inactive",
};

export default function Assets() {
  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = (assets ?? []).filter((a) => {
    const matchCat = selectedCategory === "all" || a.category_id === selectedCategory;
    const matchSearch = a.asset_name.includes(search) || a.asset_code.includes(search) || 
      ((a as any).employees?.full_name ?? "").includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => (
                <tr key={asset.id}>
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
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">לא נמצאו פריטים</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <AddAssetDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
