import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, FileSignature, Search, Package, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAssets, useAssetCategories } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { HandoverFlow } from "@/components/handover/HandoverFlow";
import { MultiHandoverFlow } from "@/components/handover/MultiHandoverFlow";
import { DOMAIN_META, DOMAIN_ORDER, getDomain, domainKeyToSlug, type DomainKey } from "@/lib/assetDomains";
import { cn } from "@/lib/utils";
import { usePersistentFilter } from "@/hooks/usePersistentFilter";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, string> = {
  in_use: "בשימוש", in_stock: "במלאי", in_repair: "בתיקון", lost: "אבד",
};

type SortKey = "name" | "code" | "category" | "created_desc" | "created_asc";

export default function UnassignedAssets() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: assets, isLoading } = useAssets();
  const { data: categories } = useAssetCategories();
  const { data: groups } = useAssetGroups();

  const [q, setQ] = usePersistentFilter<string>("unassigned:q", "");
  const [domain, setDomain] = usePersistentFilter<"all" | DomainKey>("unassigned:domain", "all");
  const [categoryId, setCategoryId] = usePersistentFilter<string>("unassigned:cat", "all");
  const [groupId, setGroupId] = usePersistentFilter<string>("unassigned:group", "all");
  const [status, setStatus] = usePersistentFilter<string>("unassigned:status", "all");
  const [sort, setSort] = usePersistentFilter<SortKey>("unassigned:sort", "created_desc");
  const [handoverAsset, setHandoverAsset] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiOpen, setMultiOpen] = useState(false);

  const catById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of (categories ?? []) as any[]) m.set(c.id, c);
    return m;
  }, [categories]);

  const visibleCategories = useMemo(() => {
    const list = ((categories ?? []) as any[]).filter((c) => c.is_assignable !== false);
    return domain === "all" ? list : list.filter((c) => getDomain(c) === domain);
  }, [categories, domain]);

  const visibleGroups = useMemo(
    () => ((groups ?? []) as any[]).filter((g) => categoryId === "all" || g.category_id === categoryId),
    [groups, categoryId],
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = ((assets ?? []) as any[]).filter((a) => {
      if (a.current_owner_id) return false;
      const cat = catById.get(a.category_id);
      if (cat?.is_assignable === false) return false;
      if (domain !== "all" && getDomain(cat) !== domain) return false;
      if (categoryId !== "all" && a.category_id !== categoryId) return false;
      if (groupId !== "all" && a.group_id !== groupId) return false;
      if (status !== "all" && a.status !== status) return false;
      if (term) {
        const hay = [a.asset_name, a.asset_code, a.serial_number, cat?.category_name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const coll = new Intl.Collator("he");
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name": return coll.compare(a.asset_name ?? "", b.asset_name ?? "");
        case "code": return coll.compare(a.asset_code ?? "", b.asset_code ?? "");
        case "category":
          return coll.compare(
            catById.get(a.category_id)?.category_name ?? "",
            catById.get(b.category_id)?.category_name ?? "",
          );
        case "created_asc":
          return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
        default:
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
    });
    return list;
  }, [assets, catById, q, domain, categoryId, groupId, status, sort]);

  const openAsset = (a: any) => {
    const slug = domainKeyToSlug(getDomain(catById.get(a.category_id)));
    navigate(`/assets/${slug}/${a.id}`);
  };

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="page-header">
          <h1 className="page-title">בצע מסירה</h1>
          <p className="page-subtitle">כל הפריטים שאינם משויכים לעובדים — סינון, מיון ומסירה מהירה</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/assets")}>
          <ArrowRight className="w-4 h-4" />
          חזרה למשאבים
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שם / קוד / מס׳ סידורי"
            className="pr-9"
            aria-label="חיפוש פריטים"
          />
        </div>

        <Select value={domain} onValueChange={(v) => { setDomain(v as any); setCategoryId("all"); setGroupId("all"); }}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="דומיין" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הדומיינים</SelectItem>
            {DOMAIN_ORDER.map((d) => (
              <SelectItem key={d} value={d}>{DOMAIN_META[d].title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setGroupId("all"); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="קטגוריה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקטגוריות</SelectItem>
            {visibleCategories.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={groupId} onValueChange={setGroupId}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="תת-קטגוריה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל תתי-הקטגוריות</SelectItem>
            {visibleGroups.map((g: any) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="מיון" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="created_desc">נוספו לאחרונה</SelectItem>
            <SelectItem value="created_asc">הוותיקים ביותר</SelectItem>
            <SelectItem value="name">שם פריט (א-ת)</SelectItem>
            <SelectItem value="code">מזהה</SelectItem>
            <SelectItem value="category">קטגוריה</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="text-sm text-muted-foreground">{rows.length} פריטים לא משויכים</div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">טוען...</div>
      ) : rows.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          לא נמצאו פריטים לא משויכים בהתאם לסינון
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {rows.map((a: any) => (
              <div key={a.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
                <button className="w-full text-right" onClick={() => openAsset(a)}>
                  <div className="font-semibold">{a.asset_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{a.asset_code}</div>
                  <div className="text-xs text-muted-foreground">
                    {catById.get(a.category_id)?.category_name} · {statusLabels[a.status] ?? a.status}
                  </div>
                </button>
                <Button size="sm" className="w-full gap-1.5" onClick={() => setHandoverAsset(a)}>
                  <FileSignature className="w-4 h-4" /> בצע מסירה
                </Button>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="hidden sm:block bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <th className="text-right font-medium px-4 py-2">מזהה</th>
                  <th className="text-right font-medium px-4 py-2">שם פריט</th>
                  <th className="text-right font-medium px-4 py-2">קטגוריה</th>
                  <th className="text-right font-medium px-4 py-2">מס׳ סידורי</th>
                  <th className="text-right font-medium px-4 py-2">סטטוס</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id} className="border-t border-border/60 hover:bg-muted/40">
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{a.asset_code}</td>
                    <td className="px-4 py-2">
                      <button className="font-medium hover:underline" onClick={() => openAsset(a)}>
                        {a.asset_name}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {catById.get(a.category_id)?.category_name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{a.serial_number ?? "—"}</td>
                    <td className="px-4 py-2">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground",
                        a.status === "in_stock" && "bg-primary/10 text-primary",
                      )}>
                        {statusLabels[a.status] ?? a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-left">
                      <Button size="sm" className="gap-1.5" onClick={() => setHandoverAsset(a)}>
                        <FileSignature className="w-4 h-4" /> בצע מסירה
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <HandoverFlow
        open={!!handoverAsset}
        onOpenChange={(v) => { if (!v) setHandoverAsset(null); }}
        asset={handoverAsset}
      />
    </div>
  );
}
