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
  vehicleTypeFromGroupName,
  type VehicleSubscription,
  type VehicleTypeKey,
} from "@/hooks/useVehicleSubscriptions";

const statusClass: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

type Row = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  department: string;
  plate: string;
  vehicle_type: string;
  provider: string;
  start_date: string | null;
  start_date_fmt: string;
  status: string;
  status_label: string;
  notes: string;
  hasSubscription: boolean;
  subscription: VehicleSubscription | null;
  employee_vehicle_id: string | null;
  asset_id: string | null;
};

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
          plate: a.license_plate ?? a.asset_code,
          typeKey: vehicleTypeFromGroupName(groupName(a.group_id)),
          employee_id: a.current_owner_id,
          employee_name: emp?.full_name ?? a.employees?.full_name ?? "—",
          department: emp?.department ?? "—",
        });
      });

    return list;
  }, [vehicles, assets, employees, groups]);

  const rows: Row[] = useMemo(() => {
    const subsByVehicle = new Map<string, VehicleSubscription[]>();
    (subscriptions ?? []).forEach((s) => {
      const key = s.employee_vehicle_id ? `v:${s.employee_vehicle_id}` : s.asset_id ? `a:${s.asset_id}` : "orphan";
      const arr = subsByVehicle.get(key) ?? [];
      arr.push(s);
      subsByVehicle.set(key, arr);
    });

    const out: Row[] = [];
    vehicleList.forEach((v) => {
      const subs = subsByVehicle.get(v.key) ?? [];
      const base = {
        employee_id: v.employee_id,
        employee_name: v.employee_name,
        department: v.department,
        plate: v.plate,
        vehicle_type: VEHICLE_TYPE_LABELS[v.typeKey],
        employee_vehicle_id: v.employee_vehicle_id,
        asset_id: v.asset_id,
      };
      if (subs.length === 0) {
        out.push({
          ...base,
          id: v.key,
          provider: "—",
          start_date: null,
          start_date_fmt: "",
          status: "none",
          status_label: "ללא מנוי",
          notes: "",
          hasSubscription: false,
          subscription: null,
        });
        return;
      }
      subs.forEach((s) => {
        out.push({
          ...base,
          id: s.id,
          provider: s.provider,
          start_date: s.start_date,
          start_date_fmt: s.start_date ? new Date(s.start_date).toLocaleDateString("en-GB") : "",
          status: s.status,
          status_label: SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status,
          notes: s.notes ?? "",
          hasSubscription: true,
          subscription: s,
        });
      });
    });
    return out;
  }, [vehicleList, subscriptions]);

  const orphanCount = useMemo(() => {
    const known = new Set(vehicleList.map((v) => v.key));
    return (subscriptions ?? []).filter((s) => {
      const key = s.employee_vehicle_id ? `v:${s.employee_vehicle_id}` : s.asset_id ? `a:${s.asset_id}` : "orphan";
      return !known.has(key);
    }).length;
  }, [subscriptions, vehicleList]);

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter((d) => d && d !== "—"))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (q && !r.employee_name.toLowerCase().includes(q) && !r.plate.toLowerCase().includes(q)) return false;
        if (filters.provider !== "all" && r.provider !== filters.provider) return false;
        if (filters.status !== "all" && r.status !== filters.status) return false;
        if (filters.vehicleType !== "all" && r.vehicle_type !== filters.vehicleType) return false;
        if (filters.department !== "all" && r.department !== filters.department) return false;
        if (filters.coverage === "with" && !r.hasSubscription) return false;
        if (filters.coverage === "without" && r.hasSubscription) return false;
        return true;
      })
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  }, [rows, filters]);

  const activeCount = rows.filter((r) => r.status === "active").length;
  const noSubCount = rows.filter((r) => !r.hasSubscription).length;
  const byProvider = useMemo(() => {
    const map = new Map<string, number>();
    rows.filter((r) => r.status === "active").forEach((r) => map.set(r.provider, (map.get(r.provider) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

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
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={!filtered.length}
            onClick={() =>
              exportToExcel(
                filtered,
                [
                  { key: "employee_name", label: "עובד" },
                  { key: "department", label: "מחלקה" },
                  { key: "plate", label: "מס' רכב" },
                  { key: "vehicle_type", label: "סוג רכב" },
                  { key: "provider", label: "ספק" },
                  { key: "start_date_fmt", label: "תאריך התחלה" },
                  { key: "status_label", label: "סטטוס" },
                  { key: "notes", label: "הערות" },
                ],
                "מנויי_רכב"
              )
            }
          >
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
          {SUBSCRIPTION_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
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
              <th className="text-right font-medium px-4 py-3">ספק</th>
              <th className="text-right font-medium px-4 py-3">תאריך התחלה</th>
              <th className="text-right font-medium px-4 py-3">סטטוס</th>
              <th className="text-right font-medium px-4 py-3">הערות</th>
              <th className="text-right font-medium px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">לא נמצאו רכבים</td></tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => r.employee_id && navigate(`/employees/${r.employee_id}?tab=vehicles`)}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/40 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium">{r.employee_name}</td>
                  <td className="px-4 py-3 font-mono">{r.plate}</td>
                  <td className="px-4 py-3">{r.vehicle_type}</td>
                  <td className="px-4 py-3">{r.provider}</td>
                  <td className="px-4 py-3">{r.start_date_fmt || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[r.status] ?? "bg-muted text-muted-foreground"}`}>
                      {r.status_label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[18rem] truncate">{r.notes || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="sm"
                        variant={r.hasSubscription ? "ghost" : "outline"}
                        className="gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubDialog({
                            employeeVehicleId: r.employee_vehicle_id,
                            assetId: r.asset_id,
                            label: `${r.plate} · ${r.employee_name}`,
                            subscription: r.subscription,
                          });
                        }}
                      >
                        {r.hasSubscription ? "עריכה" : (<><Plus className="w-3.5 h-3.5" />הוסף מנוי</>)}
                      </Button>
                      {r.hasSubscription && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          title="הוספת מנוי נוסף לרכב זה"
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
                          מנוי נוסף
                        </Button>
                      )}
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
