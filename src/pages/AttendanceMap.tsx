import { useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { useLiveEmployeeLocations } from "@/hooks/useLiveEmployeeLocations";
import { EmployeeMapView } from "@/components/attendance/EmployeeMapView";
import { Card } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, LogIn, LogOut, MapPin, RefreshCw, Users } from "lucide-react";
import { StateView } from "@/components/feedback/StateView";
import { StatusChip } from "@/components/feedback/StatusChip";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { AttendanceLocationReport } from "@/components/attendance/AttendanceLocationReport";

type View = "map" | "report";

/** Live attendance map, and a per-employee report of check-in/check-out times and places (?view=report). */
export default function AttendanceMap() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get("view") === "report" ? "report" : "map";
  const setView = (v: View) => {
    const next = new URLSearchParams(searchParams);
    if (v === "map") next.delete("view");
    else next.set("view", v);
    setSearchParams(next, { replace: true });
  };

  return (
    <div dir="rtl" className="flex flex-col">
      <div className="px-4 md:px-6 pt-4 md:pt-6 flex flex-wrap gap-2" role="group" aria-label="תצוגת מפת נוכחות">
        <Button variant={view === "map" ? "default" : "outline"} size="sm" aria-pressed={view === "map"} onClick={() => setView("map")}>
          <MapPin aria-hidden="true" /> מפה חיה
        </Button>
        <Button variant={view === "report" ? "default" : "outline"} size="sm" aria-pressed={view === "report"} onClick={() => setView("report")}>
          <FileText aria-hidden="true" /> דוח החתמות ומיקומים
        </Button>
      </div>
      {view === "map" ? (
        <LiveMap />
      ) : (
        <div className="p-4 md:p-6 flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" aria-hidden="true" />
              דוח החתמות ומיקומים
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              עובדים שמחתימים מרחוק — לכל עובד ולכל יום: שעת כניסה ומיקומה, שעת יציאה ומיקומה. משמרת שעוברת חצות נרשמת ביום הכניסה.
            </p>
          </div>
          <AttendanceLocationReport />
        </div>
      )}
    </div>
  );
}

function LiveMap() {
  const { data: locations = [], isLoading, error, refetch, isFetching } = useLiveEmployeeLocations();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const departments = useMemo(() => {
    const set = new Set<string>();
    locations.forEach((l) => l.department && set.add(l.department));
    return Array.from(set).sort();
  }, [locations]);

  const filtered = useMemo(() => {
    return locations.filter((l) => {
      if (deptFilter && l.department !== deptFilter) return false;
      if (search && !l.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [locations, search, deptFilter]);

  const inCount = filtered.filter((l) => l.direction === "in").length;
  const outCount = filtered.filter((l) => l.direction === "out").length;

  return (
    <div className="p-4 md:p-6 flex flex-col gap-4 lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" aria-hidden="true" />
            מפת נוכחות חיה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מיקומי GPS של עובדים שביצעו החתמה היום
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <LogIn className="w-3.5 h-3.5 text-success" aria-hidden="true" />
            בעבודה: <span className="tabular-nums">{inCount}</span>
          </Badge>
          <Badge variant="outline" className="gap-1">
            <LogOut className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            יצא: <span className="tabular-nums">{outCount}</span>
          </Badge>
          <Button size="icon-touch" variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="רענן מיקומי עובדים">
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 lg:flex-1 lg:min-h-0">
        {/* Sidebar list */}
        <Card className="p-3 flex flex-col gap-3 min-h-0 max-h-[55dvh] lg:max-h-none">
          <SearchInput
            size="sm"
            label="חיפוש עובד במפה"
            placeholder="חיפוש עובד..."
            value={search}
            onValueChange={setSearch}
          />

          {departments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Button
                variant={deptFilter === null ? "default" : "outline"}
                size="sm"
                className="min-h-11 lg:min-h-9 text-sm"
                onClick={() => setDeptFilter(null)}
              >
                הכל
              </Button>
              {departments.map((d) => (
                <Button
                  key={d}
                  variant={deptFilter === d ? "default" : "outline"}
                  size="sm"
                  className="min-h-11 lg:min-h-9 text-sm"
                  onClick={() => setDeptFilter(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
            <StateView
              loading={isLoading}
              error={error}
              onRetry={() => refetch()}
              label="מיקומי עובדים"
              isEmpty={filtered.length === 0}
              empty={{
                title: locations.length === 0 ? "אין עובדים עם מיקום היום" : "אין עובדים שתואמים לסינון",
                description:
                  locations.length === 0
                    ? "מיקום מופיע כאן אחרי שעובד מחתים עם GPS."
                    : undefined,
                icon: <Users className="h-6 w-6" />,
                action:
                  locations.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setDeptFilter(null);
                      }}
                    >
                      נקה סינון
                    </Button>
                  ) : undefined,
              }}
            >
            {filtered.map((loc) => (
              <div
                key={loc.employee_id}
                className="border rounded-lg p-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-base truncate">{loc.full_name}</div>
                    <div className="text-[0.8125rem] text-muted-foreground truncate">
                      {loc.role}{loc.department && ` • ${loc.department}`}
                    </div>
                  </div>
                  {loc.direction === "in" ? (
                    <StatusChip tone="success" icon={LogIn}>בעבודה</StatusChip>
                  ) : (
                    <StatusChip tone="neutral" icon={LogOut}>יצא</StatusChip>
                  )}
                </div>
                <div className="text-[0.8125rem] text-muted-foreground mt-1 flex items-center justify-between tabular-nums">
                  <span>
                    {new Date(loc.punch_at).toLocaleTimeString("he-IL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {loc.accuracy != null && <span>±{Math.round(loc.accuracy)} מ׳</span>}
                </div>
              </div>
            ))}
            </StateView>
          </div>
        </Card>

        {/* Map */}
        <Card className="overflow-hidden p-0 h-[60dvh] min-h-[400px] lg:h-auto">
          <EmployeeMapView locations={filtered} />
        </Card>
      </div>
    </div>
  );
}
