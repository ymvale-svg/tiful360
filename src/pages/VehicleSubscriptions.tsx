import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Download, Search, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAssets, useEmployees } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { usePersistentFilter } from "@/hooks/usePersistentFilter";
import { exportToExcel } from "@/lib/exportExcel";
import {
  SUBSCRIPTION_PROVIDERS,
  SUBSCRIPTION_STATUS_LABELS,
  VEHICLE_TYPE_LABELS,
  useEmployeeVehicles,
  useVehicleSubscriptions,
  vehicleTypeFromGroupName,
} from "@/hooks/useVehicleSubscriptions";

const statusClass: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  suspended: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  cancelled: "bg-muted text-muted-foreground",
};

export default function VehicleSubscriptions() {
  const navigate = useNavigate();
  const { data: subscriptions } = useVehicleSubscriptions();
  const { data: vehicles } = useEmployeeVehicles();
  const { data: assets } = useAssets();
  const { data: employees } = useEmployees();
  const { data: groups } = useAssetGroups();

  const [filters, setFilters, resetFilters] = usePersistentFilter("vehicle-subscriptions", {
    q: "",
    provider: "all",
    status: "all",
    vehicleType: "all",
    department: "all",
  });

  const rows = useMemo(() => {
    const empById = new Map((employees ?? []).map((e: any) => [e.id, e]));
    const assetById = new Map((assets ?? []).map((a: any) => [a.id, a]));
    const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v]));
    const groupName = (gid?: string | null) => (groups ?? []).find((g) => g.id === gid)?.name ?? null;

    return (subscriptions ?? []).map((s) => {
      let plate = "—";
      let typeKey: keyof typeof VEHICLE_TYPE_LABELS = "private";
      let employeeId: string | null = null;
      let vehicleMissing = false;

      if (s.employee_vehicle_id) {
        const v = vehicleById.get(s.employee_vehicle_id);
        if (v) {
          plate = v.license_plate;
          employeeId = v.employee_id;
        } else vehicleMissing = true;
      } else if (s.asset_id) {
        const a = assetById.get(s.asset_id);
        if (a) {
          plate = a.license_plate ?? a.asset_code;
          typeKey = vehicleTypeFromGroupName(groupName(a.group_id));
          employeeId = a.current_owner_id ?? null;
        } else vehicleMissing = true;
      }

      const emp: any = employeeId ? empById.get(employeeId) : null;
      return {
        id: s.id,
        employee_id: employeeId,
        employee_name: emp?.full_name ?? "—",
        department: emp?.department ?? "—",
        plate,
        vehicle_type: VEHICLE_TYPE_LABELS[typeKey],
        provider: s.provider,
        start_date: s.start_date,
        start_date_fmt: s.start_date ? new Date(s.start_date).toLocaleDateString("en-GB") : "",
        status: s.status,
        status_label: SUBSCRIPTION_STATUS_LABELS[s.status] ?? s.status,
        notes: s.notes ?? "",
        vehicleMissing,
      };
    });
  }, [subscriptions, vehicles, assets, employees, groups]);

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
        return true;
      })
      .sort((a, b) => (b.start_date ?? "").localeCompare(a.start_date ?? ""));
  }, [rows, filters]);

  const activeCount = rows.filter((r) => r.status === "active").length;
  const missingVehicleCount = rows.filter((r) => r.vehicleMissing).length;
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
          <p className="page-subtitle">מנויי כבישי אגרה וחניה לכל רכבי העובדים — פרטיים ורכבי חברה</p>
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

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">מנויים פעילים</div>
          <div className="text-2xl font-bold mt-1">{activeCount}</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-muted-foreground">מנויים ללא רכב פעיל</div>
          <div className="text-2xl font-bold mt-1">{missingVehicleCount}</div>
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
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">לא נמצאו מנויים</td></tr>
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
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass[r.status] ?? ""}`}>{r.status_label}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[18rem] truncate">{r.notes || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
