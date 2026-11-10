import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, MapPin, MapPinned, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField } from "@/components/feedback/FormField";
import { StateView } from "@/components/feedback/StateView";
import { useToast } from "@/hooks/use-toast";
import { useAttendanceLocationReport, resolvePunchAddresses } from "@/hooks/useAttendanceLocationReport";
import {
  EXPORT_HEADERS,
  buildShiftRows,
  formatDay,
  formatMinutes,
  hebrewWeekday,
  punchIdsMissingAddress,
  toExportRows,
  type PunchPlace,
  type ShiftRow,
} from "@/lib/attendanceLocationReport";
import { ilDate } from "@/lib/michpalExport";
import { exportToExcel } from "@/lib/exportExcel";
import { cn } from "@/lib/utils";

const MAX_DAYS = 93;
const ALL = "";

function monthStart(today: string) {
  return `${today.slice(0, 8)}01`;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

function PlaceCell({ p }: { p: PunchPlace | null }) {
  if (!p) return <span className="text-muted-foreground">—</span>;
  const hasPoint = typeof p.lat === "number" && typeof p.lng === "number";
  if (!hasPoint) return <span className="text-muted-foreground">{p.place}</span>;
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-start gap-1 text-primary underline-offset-2 hover:underline focus-visible:underline"
      aria-label={`${p.place} — פתיחה במפה בחלון חדש`}
    >
      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className={cn(p.addressPending && "text-muted-foreground")}>{p.place}</span>
    </a>
  );
}

/** Remote-punching employees, per employee and day: check-in time and place, check-out time and place. Excel export. */
export function AttendanceLocationReport() {
  const today = ilDate(new Date());
  const [from, setFrom] = useState(() => monthStart(today));
  const [to, setTo] = useState(today);
  const [employeeId, setEmployeeId] = useState<string>(ALL);
  const [resolving, setResolving] = useState(false);
  const qc = useQueryClient();
  const { toast } = useToast();

  const rangeError = !from || !to
    ? "יש לבחור תאריך התחלה וסיום"
    : from > to
      ? "תאריך ההתחלה מאוחר מתאריך הסיום"
      : daysBetween(from, to) > MAX_DAYS
        ? `ניתן להפיק דוח לטווח של עד ${MAX_DAYS} יום`
        : null;

  const { data: punches = [], isLoading, error, refetch, isFetching } = useAttendanceLocationReport(from, to, !rangeError);

  const allRows = useMemo(() => (rangeError ? [] : buildShiftRows(punches, from, to)), [punches, from, to, rangeError]);

  const employeeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allRows) m.set(r.employee_id, r.full_name);
    return [
      { value: ALL, label: "כל העובדים" },
      ...[...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "he")),
    ];
  }, [allRows]);

  const rows = useMemo(
    () => (employeeId === ALL ? allRows : allRows.filter((r) => r.employee_id === employeeId)),
    [allRows, employeeId],
  );

  const groups = useMemo(() => {
    const m = new Map<string, ShiftRow[]>();
    for (const r of rows) {
      const list = m.get(r.employee_id) ?? [];
      list.push(r);
      m.set(r.employee_id, list);
    }
    return [...m.values()];
  }, [rows]);

  const missingIds = useMemo(() => {
    const visible = new Set<string>();
    for (const r of rows) {
      if (r.in?.addressPending) visible.add(r.in.punch_id);
      if (r.out?.addressPending) visible.add(r.out.punch_id);
    }
    return punchIdsMissingAddress(punches).filter((id) => visible.has(id));
  }, [punches, rows]);

  const resolveMissing = async (ids: string[]) => {
    if (ids.length === 0) return;
    setResolving(true);
    try {
      const refresh = () => qc.invalidateQueries({ queryKey: ["attendance_location_report"] });
      const res = await resolvePunchAddresses(ids, () => void refresh());
      await refresh();
      if (res.failed.length) {
        toast({
          title: "חלק מהכתובות לא הושלמו",
          description: "במקומן מוצגות הקואורדינטות. אפשר לנסות שוב מאוחר יותר.",
          variant: "destructive",
        });
      }
    } finally {
      setResolving(false);
    }
  };

  // Resolve addresses once per loaded range, in the background.
  const autoResolved = useRef<string>("");
  useEffect(() => {
    const key = `${from}|${to}`;
    if (isLoading || isFetching || resolving || autoResolved.current === key || missingIds.length === 0) return;
    autoResolved.current = key;
    void resolveMissing(missingIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, isLoading, isFetching, missingIds]);

  const handleExport = async () => {
    if (missingIds.length && !resolving) await resolveMissing(missingIds);
    const fresh = (await refetch()).data ?? punches;
    const all = buildShiftRows(fresh, from, to);
    const out = employeeId === ALL ? all : all.filter((r) => r.employee_id === employeeId);
    const who = employeeId === ALL ? "" : `-${employeeOptions.find((o) => o.value === employeeId)?.label ?? ""}`;
    await exportToExcel(toExportRows(out), EXPORT_HEADERS, `דוח-מיקומים${who}-${formatDay(from).replace(/\//g, "-")}-עד-${formatDay(to).replace(/\//g, "-")}`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FormField label="מתאריך" className="w-40" error={rangeError && rangeError.includes("התחלה") ? rangeError : null}>
          <DateInput value={from} onChange={(e) => setFrom(e.target.value)} />
        </FormField>
        <FormField label="עד תאריך" className="w-40" error={rangeError && !rangeError.includes("התחלה") ? rangeError : null}>
          <DateInput value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        <FormField label="עובד" className="w-64">
          <SearchableSelect
            value={employeeId}
            onChange={setEmployeeId}
            options={employeeOptions}
            placeholder="כל העובדים"
            searchPlaceholder="חיפוש עובד..."
          />
        </FormField>
        <div className="flex flex-wrap gap-2 ms-auto">
          {missingIds.length > 0 && (
            <Button variant="outline" onClick={() => resolveMissing(missingIds)} loading={resolving} loadingText="משלים כתובות…">
              <MapPinned aria-hidden="true" /> השלמת כתובות ({missingIds.length})
            </Button>
          )}
          <Button onClick={handleExport} disabled={!!rangeError || rows.length === 0 || resolving}>
            <FileSpreadsheet aria-hidden="true" /> ייצוא לאקסל
          </Button>
        </div>
      </div>

      <StateView
        loading={isLoading}
        error={error}
        onRetry={() => refetch()}
        label="דוח המיקומים"
        isEmpty={!rangeError && rows.length === 0}
        empty={{
          title: "אין החתמות מרחוק בטווח שנבחר",
          description: "הדוח כולל רק עובדים שמחתימים מרחוק. בחרו טווח תאריכים אחר או עובד אחר.",
          icon: <Users className="h-6 w-6" />,
        }}
      >
        <div className="flex flex-col gap-6">
          {groups.map((g) => {
            const first = g[0];
            const total = g.reduce((s, r) => s + (r.minutes ?? 0), 0);
            return (
              <section key={first.employee_id} aria-labelledby={`emp-${first.employee_id}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 id={`emp-${first.employee_id}`} className="text-base font-semibold">{first.full_name}</h2>
                  <span className="text-sm text-muted-foreground">
                    {[first.employee_code && `מס׳ ${first.employee_code}`, first.department].filter(Boolean).join(" • ")}
                  </span>
                  <span className="text-sm text-muted-foreground ms-auto tabular-nums">סה״כ {formatMinutes(total)} שעות</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col" className="text-start">תאריך</TableHead>
                      <TableHead scope="col" className="text-start">כניסה</TableHead>
                      <TableHead scope="col" className="text-start">מיקום כניסה</TableHead>
                      <TableHead scope="col" className="text-start">יציאה</TableHead>
                      <TableHead scope="col" className="text-start">מיקום יציאה</TableHead>
                      <TableHead scope="col" className="text-start">משך</TableHead>
                      <TableHead scope="col" className="text-start">הערה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatDay(r.day)}
                          <span className="block text-xs text-muted-foreground">{hebrewWeekday(r.day)}</span>
                        </TableCell>
                        <TableCell className="text-start tabular-nums">{r.in?.time ?? "—"}</TableCell>
                        <TableCell className="min-w-48"><PlaceCell p={r.in} /></TableCell>
                        <TableCell className="text-start tabular-nums">{r.out?.time ?? "—"}</TableCell>
                        <TableCell className="min-w-48"><PlaceCell p={r.out} /></TableCell>
                        <TableCell className="text-start tabular-nums">{formatMinutes(r.minutes) || "—"}</TableCell>
                        <TableCell className={cn(r.note && r.note !== "בעבודה" && "text-warning font-medium")}>
                          {r.note}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            );
          })}
        </div>
      </StateView>
    </div>
  );
}
