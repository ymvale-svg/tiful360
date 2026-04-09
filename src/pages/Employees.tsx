import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Download, Eye, MoreHorizontal, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmployees } from "@/hooks/useData";

type EmployeeStatus = "active" | "onboarding" | "leaving" | "inactive";

const statusLabels: Record<EmployeeStatus, string> = {
  active: "פעיל",
  onboarding: "בקליטה",
  leaving: "בעזיבה",
  inactive: "לא פעיל",
};

const statusClasses: Record<EmployeeStatus, string> = {
  active: "status-active",
  onboarding: "status-onboarding",
  leaving: "status-leaving",
  inactive: "status-inactive",
};

export default function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("all");

  const filtered = (employees ?? []).filter((emp) => {
    const matchSearch = emp.full_name.includes(search) || emp.employee_code.includes(search) || emp.role.includes(search);
    const matchStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">ניהול עובדים</h1>
          <p className="page-subtitle">{employees?.length ?? 0} עובדים רשומים במערכת</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          עובד חדש
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 w-72">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, מזהה, תפקיד..."
            className="bg-transparent text-sm outline-none w-full"
          />
        </div>

        <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
          {(["all", "active", "onboarding", "leaving", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {s === "all" ? "הכל" : statusLabels[s]}
            </button>
          ))}
        </div>
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
                <th>שם מלא</th>
                <th>תפקיד</th>
                <th>מחלקה</th>
                <th>סטטוס</th>
                <th>תאריך התחלה</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => (
                <tr key={emp.id}>
                  <td className="font-mono text-xs text-muted-foreground">{emp.employee_code}</td>
                  <td className="font-medium">{emp.full_name}</td>
                  <td>{emp.role}</td>
                  <td>{emp.department}</td>
                  <td>
                    <span className={`status-badge ${statusClasses[emp.status as EmployeeStatus] ?? "status-inactive"}`}>
                      {emp.status === "leaving" && <UserMinus className="w-3 h-3" />}
                      {statusLabels[emp.status as EmployeeStatus] ?? emp.status}
                    </span>
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(emp.start_date).toLocaleDateString("he-IL")}
                  </td>
                  <td>
                    <Link
                      to={`/employees/${emp.id}`}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground inline-block"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">לא נמצאו עובדים</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
