import { useMemo, useState } from "react";
import { useLiveEmployeeLocations } from "@/hooks/useLiveEmployeeLocations";
import { EmployeeMapView } from "@/components/attendance/EmployeeMapView";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, RefreshCw, Search, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AttendanceMap() {
  const { data: locations = [], isLoading, refetch, isFetching } = useLiveEmployeeLocations();
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
    <div dir="rtl" className="p-4 md:p-6 h-[calc(100vh-3rem)] flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            מפת נוכחות חיה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מיקומי GPS של עובדים שביצעו החתמה היום
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-green-600 inline-block" />
            בעבודה: {inCount}
          </Badge>
          <Badge variant="outline" className="gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
            יצא: {outCount}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 flex-1 min-h-0">
        {/* Sidebar list */}
        <Card className="p-3 flex flex-col gap-3 min-h-0">
          <div className="relative">
            <Search className="absolute right-2 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש עובד..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-8"
            />
          </div>

          {departments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <Button
                variant={deptFilter === null ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setDeptFilter(null)}
              >
                הכל
              </Button>
              {departments.map((d) => (
                <Button
                  key={d}
                  variant={deptFilter === d ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setDeptFilter(d)}
                >
                  {d}
                </Button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
            {isLoading && (
              <p className="text-xs text-muted-foreground text-center py-4">טוען...</p>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                אין עובדים עם מיקום היום
              </div>
            )}
            {filtered.map((loc) => (
              <div
                key={loc.employee_id}
                className="border rounded-lg p-2.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{loc.full_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {loc.role}{loc.department && ` • ${loc.department}`}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                      loc.direction === "in"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
                    )}
                  >
                    {loc.direction === "in" ? "בעבודה" : "יצא"}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
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
          </div>
        </Card>

        {/* Map */}
        <Card className="overflow-hidden p-0 min-h-[400px]">
          <EmployeeMapView locations={filtered} />
        </Card>
      </div>
    </div>
  );
}
