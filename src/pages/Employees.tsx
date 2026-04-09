import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Filter, Download, Eye, MoreHorizontal, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmployeeStatus = "active" | "onboarding" | "leaving" | "inactive";

interface Employee {
  id: string;
  name: string;
  idNumber: string;
  role: string;
  department: string;
  status: EmployeeStatus;
  startDate: string;
  assetsCount: number;
}

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

const mockEmployees: Employee[] = [
  { id: "EMP-001", name: "דוד כהן", idNumber: "301234567", role: "מנהל פרויקט", department: "הנדסה", status: "active", startDate: "12/03/2021", assetsCount: 8 },
  { id: "EMP-002", name: "יעל לוי", idNumber: "302345678", role: "סוכנת שטח", department: "מכירות", status: "active", startDate: "05/08/2022", assetsCount: 5 },
  { id: "EMP-003", name: "רונית שמש", idNumber: "303456789", role: "מעצבת גרפית", department: "שיווק", status: "leaving", startDate: "15/01/2020", assetsCount: 6 },
  { id: "EMP-004", name: "עמוס גולן", idNumber: "304567890", role: "מהנדס בניין", department: "הנדסה", status: "leaving", startDate: "20/06/2019", assetsCount: 11 },
  { id: "EMP-005", name: "שרה דוד", idNumber: "305678901", role: "חשבת", department: "כספים", status: "active", startDate: "01/11/2023", assetsCount: 3 },
  { id: "EMP-006", name: "משה אברהם", idNumber: "306789012", role: "טכנאי מערכות", department: "IT", status: "onboarding", startDate: "01/02/2026", assetsCount: 0 },
  { id: "EMP-007", name: "אמיר בן דוד", idNumber: "307890123", role: "מודד", department: "הנדסה", status: "active", startDate: "10/09/2024", assetsCount: 7 },
  { id: "EMP-008", name: "נועה ישראלי", idNumber: "308901234", role: "מנהלת HR", department: "משאבי אנוש", status: "active", startDate: "03/04/2018", assetsCount: 4 },
];

export default function Employees() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("all");

  const filtered = mockEmployees.filter((emp) => {
    const matchSearch = emp.name.includes(search) || emp.id.includes(search) || emp.role.includes(search);
    const matchStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">ניהול עובדים</h1>
          <p className="page-subtitle">{mockEmployees.length} עובדים רשומים במערכת</p>
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

        <Button variant="outline" size="sm" className="gap-2 mr-auto">
          <Download className="w-4 h-4" />
          ייצוא
        </Button>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>מזהה</th>
              <th>שם מלא</th>
              <th>תפקיד</th>
              <th>מחלקה</th>
              <th>סטטוס</th>
              <th>תאריך התחלה</th>
              <th>פריטי ציוד</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((emp) => (
              <tr key={emp.id}>
                <td className="font-mono text-xs text-muted-foreground">{emp.id}</td>
                <td className="font-medium">{emp.name}</td>
                <td>{emp.role}</td>
                <td>{emp.department}</td>
                <td>
                  <span className={`status-badge ${statusClasses[emp.status]}`}>
                    {emp.status === "leaving" && <UserMinus className="w-3 h-3" />}
                    {statusLabels[emp.status]}
                  </span>
                </td>
                <td className="text-muted-foreground">{emp.startDate}</td>
                <td>
                  <span className="font-medium">{emp.assetsCount}</span>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/employees/${emp.id}`}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
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
