import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Plus, Search, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssets, useEmployees } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { usePersistentFilter } from "@/hooks/usePersistentFilter";
import { exportToExcel } from "@/lib/exportExcel";
import { VehicleSubscriptionDialog } from "@/components/vehicles/VehicleSubscriptionDialog";
import {
  SUBSCRIPTION_PROVIDERS,
  SUBSCRIPTION_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  useEmployeeVehicles,
  useVehicleSubscriptions,
  resolveVehiclePlate,
  vehicleTypeFromGroupName,
  isSubscriptionActive,
  type VehicleSubscription,
  type VehicleTypeKey,
} from "@/hooks/useVehicleSubscriptions";

const statusClass: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  inactive: "bg-muted text-muted-foreground border-border",
};

/** A subscription tag: either a real vehicle_subscriptions row, or one derived
 *  from a subscription asset (דומיין רישיונות ותוכנות > שירותי מנוי) held by the employee. */
type SubItem = VehicleSubscription & {
  source: "record" | "asset";
  /** For source === "asset": the asset id, so the tag links to the item card. */
  source_asset_id?: string;
};

type Row = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  department: string;
  plate: string;
  vehicle_type: string;
  employee_vehicle_id: string | null;
  asset_id: string | null;
  subs: SubItem[];
  /** Active subscriptions only — what is rendered as tags. */
  activeSubs: SubItem[];
};


const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "");

export default function VehicleSubscriptions() {
  const navigate = useNavigate();
  const { data: subscriptions } = useVehicleSubscriptions();
  const { data: vehicles } = useEmployeeVehicles();
  const { data: assets } = useAssets();
  const { data: employees } = useEmployees();
  const { data: groups } = useAssetGroups();

  const [subDialog, setSubDialog] = useState<{
    employeeVehicleId?: string | null;
    assetId?: string | null;
    label?: string;
    subscription?: VehicleSubscription | null;
  } | null>(null);

  const [filters, setFilters, resetFilters] = usePersistentFilter("vehicle-subscriptions", {
    q: "",
    provider: "all",
    status: "all",
    vehicleType: "all",
    department: "all",
    coverage: "all",
  });

  /** Every vehicle attached to an employee — private vehicles + company vehicle assets. */
  const vehicleList = useMemo(() => {
    const empById = new Map((employees ?? []).map((e: any) => [e.id, e]));
    const groupName = (gid?: string | null) => (groups ?? []).find((g) => g.id === gid)?.name ?? null;

    const list: {
      key: string;
      employee_vehicle_id: string | null;
      asset_id: string | null;
      plate: string;
      typeKey: VehicleTypeKey;
      employee_id: string | null;
      employee_name: string;
      department: string;
    }[] = [];

    (vehicles ?? []).forEach((v) => {
      const emp: any = empById.get(v.employee_id);
      list.push({
        key: `v:${v.id}`,
        employee_vehicle_id: v.id,
        asset_id: null,
        plate: v.license_plate,
        typeKey: "private",
        employee_id: v.employee_id,
        employee_name: emp?.full_name ?? "—",
        department: emp?.department ?? "—",
      });
    });

    (assets ?? [])
      .filter((a: any) => a.asset_categories?.protocol_type === "vehicle" && a.current_owner_id)
      .forEach((a: any) => {
        const emp: any = empById.get(a.current_owner_id);
        list.push({
          key: `a:${a.id}`,
          employee_vehicle_id: null,
          asset_id: a.id,
          plate: resolveVehiclePlate(a),
          typeKey: vehicleTypeFromGroupName(groupName(a.group_id)),
          employee_id: a.current_owner_id,
          employee_name: emp?.full_name ?? a.employees?.full_name ?? "—",
          department: emp?.department ?? "—",
        });
      });

    return list;
  }, [vehicles, assets, employees, groups]);

  /** Subscriptions that exist as assets (רישיונות ותוכנות > שירותי מנוי) assigned to employees. */
  const assetSubsByEmployee = useMemo(() => {
    const groupName = (gid?: string | null) => (groups ?? []).find((g) => g.id === gid)?.name ?? null;
    const map = new Map<string, SubItem[]>();
    (assets ?? [])
      .filter((a: any) => {
        if (!a.current_owner_id) return false;
        const cat = a.asset_categories;
        if (!cat) return false;
        return cat.prefix === "MAN" || (cat.category_name ?? "").includes("מנוי");
      })
      .forEach((a: any) => {
        const provider = groupName(a.group_id) ?? a.asset_name ?? "מנוי";
        const item: SubItem = {
          id: `asset:${a.id}`,
          company_id: a.company_id,
          employee_vehicle_id: null,
          asset_id: null,
          provider,
          start_date: a.created_at ?? null,
          status: a.status === "in_use" ? "active" : "inactive",
          notes: a.notes ?? null,
          created_at: a.created_at,
          source: "asset",
          source_asset_id: a.id,
        };
        const arr = map.get(a.current_owner_id) ?? [];
        arr.push(item);
        map.set(a.current_owner_id, arr);
      });
    return map;
  }, [assets, groups]);

  /** One row per vehicle; subscriptions attached as tags. */
  const rows: Row[] = useMemo(() => {
    const subsByVehicle = new Map<string, SubItem[]>();
    (subscriptions ?? []).forEach((s) => {
      const key = s.employee_vehicle_id ? `v:${s.employee_vehicle_id}` : s.asset_id ? `a:${s.asset_id}` : "orphan";
      const arr = subsByVehicle.get(key) ?? [];
      arr.push({ ...s, source: "record" });
      subsByVehicle.set(key, arr);
    });

    const empById = new Map((employees ?? []).map((e: any) => [e.id, e]));
    const usedEmployees = new Set<string>();

    const out: Row[] = vehicleList.map((v) => {
      let subs = subsByVehicle.get(v.key) ?? [];
      // Asset-based subscriptions belong to the employee — attach them to their first vehicle row.
      if (v.employee_id && !usedEmployees.has(v.employee_id)) {
        usedEmployees.add(v.employee_id);
        subs = [...subs, ...(assetSubsByEmployee.get(v.employee_id) ?? [])];
      }
      subs = [...subs].sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
      return {
        id: v.key,
        employee_id: v.employee_id,
        employee_name: v.employee_name,
        department: v.department,
        plate: v.plate,
        vehicle_type: VEHICLE_TYPE_LABELS[v.typeKey],
        employee_vehicle_id: v.employee_vehicle_id,
        asset_id: v.asset_id,
        activeSubs: subs.filter((s) => isSubscriptionActive(s.status)),
        subs,
      };
    });

    // Employees holding subscription assets but with no vehicle attached — still show them.
    assetSubsByEmployee.forEach((subs, empId) => {
      if (usedEmployees.has(empId)) return;
      const emp: any = empById.get(empId);
      out.push({
        id: `e:${empId}`,
        employee_id: empId,
        employee_name: emp?.full_name ?? "—",
        department: emp?.department ?? "—",
        plate: "—",
        vehicle_type: "ללא רכב",
        employee_vehicle_id: null,
        asset_id: null,
        activeSubs: subs.filter((s) => isSubscriptionActive(s.status)),
        subs,
      });
    });

    return out;
  }, [vehicleList, subscriptions, assetSubsByEmployee, employees]);

  const orphanCount = useMemo(() => {
    const known = new Set(vehicleList.map((v) => v.key));
    return (subscriptions ?? []).filter((s) => {
      const key = s.employee_vehicle_id ? `v:${s.employee_vehicle_id}` : s.asset_id ? `a:${s.asset_id}` : "orphan";
      return !known.has(key);
    }).length;
  }, [subscriptions, vehicleList]);

  const providerOptions = useMemo(() => {
    const set = new Set<string>(SUBSCRIPTION_PROVIDERS);
    (subscriptions ?? []).forEach((s) => set.add(s.provider));
    assetSubsByEmployee.forEach((subs) => subs.forEach((s) => set.add(s.provider)));
    return Array.from(set);
  }, [subscriptions, assetSubsByEmployee]);


  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter((d) => d && d !== "—"))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q && !r.employee_name.toLowerCase().includes(q) && !r.plate.toLowerCase().includes(q)) return false;
        if (filters.provider !== "all" && !r.subs.some((s) => s.provider === filters.provider)) return false;
        if (filters.status !== "all") {
          if (filters.status === "active" && r.activeSubs.length === 0) return false;
          if (filters.status === "inactive" && !r.subs.some((s) => !isSubscriptionActive(s.status))) return false;
        }
        if (filters.vehicleType !== "all" && r.vehicle_type !== filters.vehicleType) return false;
        if (filters.department !== "all" && r.department !== filters.department) return false;
        if (filters.coverage === "with" && r.activeSubs.length === 0) return false;
        if (filters.coverage === "without" && r.activeSubs.length > 0) return false;
        return true;
      })
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name, "he"));
  }, [rows, filters]);

  const activeCount = rows.reduce((n, r) => n + r.activeSubs.length, 0);
  const noSubCount = rows.filter((r) => r.activeSubs.length === 0).length;
  const byProvider = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => r.activeSubs.forEach((s) => map.set(s.provider, (map.get(s.provider) ?? 0) + 1)));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  /** Excel: one line per vehicle, each active subscription flattened into its own set of columns. */
  const handleExport = () => {
    const maxSubs = Math.max(1, ...filtered.map((r) => r.activeSubs.length));
    const headers = [
      { key: "employee_name", label: "עובד" },
      { key: "department", label: "מחלקה" },
      { key: "plate", label: "מס' רכב" },
      { key: "vehicle_type", label: "סוג רכב" },
      { key: "subs_count", label: "מס' מנויים" },
    ];
    for (let i = 1; i <= maxSubs; i++) {
      headers.push(
        { key: `p${i}`, label: `מנוי ${i} — ספק` },
        { key: `d${i}`, label: `מנוי ${i} — תאריך התחלה` },
        { key: `s${i}`, label: `מנוי ${i} — סטטוס` },
        { key: `n${i}`, label: `מנוי ${i} — הערות` }
      );
    }
    const data = filtered.map((r) => {
      const row: Record<string, any> = {
        employee_name: r.employee_name,
        department: r.department,
        plate: r.plate,
        vehicle_type: r.vehicle_type,
        subs_count: r.activeSubs.length,
      };
      r.activeSubs.forEach((s, idx) => {
        const i = idx + 1;
        row[`p${i}`] = s.provider;
        row[`d${i}`] = fmtDate(s.start_date);
        row[`s${i}`] = SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status;
        row[`n${i}`] = s.notes ?? "";
      });
      return row;
    });
    exportToExcel(data, headers, "מנויי_רכב");
  };

  const selectClass = "h-9 px-2 rounded-md border border-input bg-background text-sm";

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="page-header">
          <h1 className="page-title flex items-center gap-2">
            <Ticket className="w-5 h-5" />
            מנויים ואגרות
          </h1>
          <p className="page-subtitle">כל הרכבים המוצמדים לעובדים — פרטיים ורכבי חברה — והמנויים שלהם</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/assets")}>
            <ArrowRight className="w-4 h-4" />
            חזרה למשאבים
          </Button>
          <Button size="sm" variant="secondary" className="gap-1.5" disabled={!filtered.length} onClick={handleExport}>
            <Download className="w-4 h-4" />
            ייצוא לאקסל
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">רכבים מוצמדים</div>
          <div className="text-2xl font-bold mt-1">{vehicleList.length}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">מנויים פעילים</div>
          <div className="text-2xl font-bold mt-1">{activeCount}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">רכבים ללא מנוי</div>
          <div className="text-2xl font-bold mt-1">{noSubCount}</div>
          {orphanCount > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">{orphanCount} מנויים ללא רכב פעיל</div>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-muted-foreground mb-1">פעילים לפי ספק</div>
          <div className="flex flex-wrap gap-1.5">
            {byProvider.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              byProvider.map(([p, c]) => (
                <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-muted">
                  {p} · {c}
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="חיפוש לפי שם עובד או מס' רכב"
            className="pr-9"
          />
        </div>
        <select className={selectClass} value={filters.coverage} onChange={(e) => setFilters({ ...filters, coverage: e.target.value })}>
          <option value="all">כל הרכבים</option>
          <option value="with">עם מנוי</option>
          <option value="without">ללא מנוי</option>
        </select>
        <select className={selectClass} value={filters.provider} onChange={(e) => setFilters({ ...filters, provider: e.target.value })}>
          <option value="all">כל הספקים</option>
          {providerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select className={selectClass} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="all">כל הסטטוסים</option>
          {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectClass} value={filters.vehicleType} onChange={(e) => setFilters({ ...filters, vehicleType: e.target.value })}>
          <option value="all">כל סוגי הרכב</option>
          {Object.values(VEHICLE_TYPE_LABELS).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className={selectClass} value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
          <option value="all">כל המחלקות</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <Button variant="ghost" size="sm" onClick={resetFilters}>נקה סינון</Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-right font-medium px-4 py-3">עובד</th>
              <th className="text-right font-medium px-4 py-3">מס' רכב</th>
              <th className="text-right font-medium px-4 py-3">סוג רכב</th>
              <th className="text-right font-medium px-4 py-3">מנויים</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">לא נמצאו רכבים</td></tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => r.employee_id && navigate(`/employees/${r.employee_id}?tab=vehicles`)}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/40 cursor-pointer align-top"
                >
                  <td className="px-4 py-3 font-medium">{r.employee_name}</td>
                  <td className="px-4 py-3 font-mono">{r.plate}</td>
                  <td className="px-4 py-3">{r.vehicle_type}</td>
                  <td className="px-4 py-3">
                    {r.activeSubs.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        ללא מנוי{r.subs.length > 0 ? " פעיל" : ""}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {r.activeSubs.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            title={s.notes || undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubDialog({
                                employeeVehicleId: r.employee_vehicle_id,
                                assetId: r.asset_id,
                                label: `${r.plate} · ${r.employee_name}`,
                                subscription: s,
                              });
                            }}
                            className={`text-xs px-2 py-1 rounded-full border transition-opacity hover:opacity-80 ${statusClass[s.status] ?? "bg-muted text-muted-foreground border-border"}`}
                          >
                            {s.provider}
                            {s.start_date && <span className="opacity-70"> · {fmtDate(s.start_date)}</span>}
                            <span className="opacity-70"> · {SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="sm"
                        variant={r.activeSubs.length ? "ghost" : "outline"}
                        className="gap-1"
                        title="הוספת מנוי לרכב זה"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubDialog({
                            employeeVehicleId: r.employee_vehicle_id,
                            assetId: r.asset_id,
                            label: `${r.plate} · ${r.employee_name}`,
                            subscription: null,
                          });
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {r.activeSubs.length ? "מנוי נוסף" : "הוסף מנוי"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <VehicleSubscriptionDialog
        open={!!subDialog}
        onOpenChange={(v) => !v && setSubDialog(null)}
        employeeVehicleId={subDialog?.employeeVehicleId ?? null}
        assetId={subDialog?.assetId ?? null}
        vehicleLabel={subDialog?.label}
        subscription={subDialog?.subscription ?? null}
      />
    </div>
  );
}
