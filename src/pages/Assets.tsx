import { useState } from "react";
import { 
  Search, Plus, Filter, Car, Monitor, Smartphone, Wrench, 
  Package, Shield, Eye, MoreHorizontal, Boxes
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const categories = [
  { id: "all", label: "הכל", icon: Boxes, count: 843 },
  { id: "vehicles", label: "רכבים", icon: Car, count: 45 },
  { id: "laptops", label: "מחשבים", icon: Monitor, count: 132 },
  { id: "phones", label: "סמארטפונים", icon: Smartphone, count: 98 },
  { id: "measurement", label: "ציוד מדידה", icon: Wrench, count: 67 },
  { id: "drones", label: "רחפנים", icon: Package, count: 12 },
  { id: "safety", label: "בטיחות", icon: Shield, count: 489 },
];

type AssetStatus = "in-use" | "stock" | "repair" | "lost";
const statusLabel: Record<AssetStatus, string> = { "in-use": "בשימוש", stock: "במלאי", repair: "בתיקון", lost: "אבד" };
const statusClass: Record<AssetStatus, string> = { "in-use": "status-active", stock: "status-onboarding", repair: "status-leaving", lost: "status-inactive" };

const mockAssets = [
  { id: "CAR-001", name: "טויוטה קורולה 2023", category: "vehicles", owner: "דוד כהן", status: "in-use" as AssetStatus, plate: "12-345-67", testDate: "15/08/2026" },
  { id: "CAR-002", name: "יונדאי טוסון 2024", category: "vehicles", owner: "יעל לוי", status: "in-use" as AssetStatus, plate: "23-456-78", testDate: "10/05/2026" },
  { id: "CAR-003", name: "סקודה אוקטביה 2022", category: "vehicles", owner: "—", status: "stock" as AssetStatus, plate: "34-567-89", testDate: "22/12/2025" },
  { id: "LAP-001", name: "Dell Latitude 5540", category: "laptops", owner: "דוד כהן", status: "in-use" as AssetStatus, plate: "SN: DL890", testDate: null },
  { id: "LAP-002", name: "Lenovo ThinkPad T14", category: "laptops", owner: "שרה דוד", status: "in-use" as AssetStatus, plate: "SN: LN456", testDate: null },
  { id: "LAP-003", name: "HP EliteBook 840", category: "laptops", owner: "—", status: "repair" as AssetStatus, plate: "SN: HP123", testDate: null },
  { id: "PHN-001", name: "iPhone 15 Pro", category: "phones", owner: "דוד כהן", status: "in-use" as AssetStatus, plate: "050-1234567", testDate: null },
  { id: "DRN-001", name: "DJI Mavic 3 Pro", category: "drones", owner: "אמיר בן דוד", status: "in-use" as AssetStatus, plate: "SN: DJ789", testDate: null },
  { id: "MES-001", name: "מד לייזר Leica BLK", category: "measurement", owner: "עמוס גולן", status: "in-use" as AssetStatus, plate: "SN: LC001", testDate: null },
];

export default function Assets() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = mockAssets.filter((a) => {
    const matchCat = selectedCategory === "all" || a.category === selectedCategory;
    const matchSearch = a.name.includes(search) || a.id.includes(search) || a.owner.includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">נכסים וציוד</h1>
          <p className="page-subtitle">ניהול מלאי ומעקב אחר כלל ציוד החברה</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Plus className="w-4 h-4" />
            קטגוריה חדשה
          </Button>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            פריט חדש
          </Button>
        </div>
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
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
            <cat.icon className="w-4 h-4" />
            {cat.label}
            <span className={cn(
              "text-xs px-1.5 py-0.5 rounded-md",
              selectedCategory === cat.id ? "bg-primary-foreground/20" : "bg-muted"
            )}>{cat.count}</span>
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
        <table className="data-table">
          <thead>
            <tr>
              <th>מזהה</th>
              <th>שם פריט</th>
              <th>פרטים</th>
              <th>בעלות</th>
              <th>סטטוס</th>
              <th>טסט/תפוגה</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => (
              <tr key={asset.id}>
                <td className="font-mono text-xs text-muted-foreground">{asset.id}</td>
                <td className="font-medium">{asset.name}</td>
                <td className="text-muted-foreground text-xs">{asset.plate}</td>
                <td>{asset.owner}</td>
                <td><span className={`status-badge ${statusClass[asset.status]}`}>{statusLabel[asset.status]}</span></td>
                <td className="text-muted-foreground text-xs">{asset.testDate || "—"}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
