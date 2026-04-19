import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Download, Eye, UserMinus, Upload, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEmployees } from "@/hooks/useData";
import { AddEmployeeDialog } from "@/components/AddEmployeeDialog";
import { ImportExcelDialog } from "@/components/ImportExcelDialog";
import { exportToExcel } from "@/lib/exportExcel";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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

async function inviteEmployees(payload: {
  company_id: string;
  employees: Array<{ employee_id: string; email: string; full_name?: string }>;
}) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=invite`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ ...payload, role: "employee" }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Failed to invite");
  return json as {
    success: boolean;
    summary: { total: number; invited: number; already_exists: number; skipped: number; failed: number };
    results: Array<{ email: string; status: string; error?: string; employee_id?: string }>;
  };
}

export default function Employees() {
  const { data: employees, isLoading } = useEmployees();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = (employees ?? []).filter((emp) => {
    const matchSearch = emp.full_name.includes(search) || emp.employee_code.includes(search) || emp.role.includes(search);
    const matchStatus = statusFilter === "all" || emp.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const inviteMutation = useMutation({
    mutationFn: inviteEmployees,
    onSuccess: (data) => {
      const { invited, already_exists, skipped, failed, total } = data.summary;
      const parts: string[] = [];
      if (invited) parts.push(`${invited} הוזמנו`);
      if (already_exists) parts.push(`${already_exists} כבר קיימים`);
      if (skipped) parts.push(`${skipped} ללא מייל`);
      if (failed) parts.push(`${failed} נכשלו`);
      toast({
        title: `סיכום הזמנות (${total})`,
        description: parts.join(" · ") || "ללא פעולות",
        variant: failed > 0 ? "destructive" : "default",
      });
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה בשליחת הזמנות", description: err.message, variant: "destructive" });
    },
  });

  const inviteWithEmailMap = useMemo(
    () => new Map((employees ?? []).map((e) => [e.id, e])),
    [employees]
  );

  const selectableInPage = filtered.filter((e) => !!e.email);
  const allSelected = selectableInPage.length > 0 && selectableInPage.every((e) => selected.has(e.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableInPage.map((e) => e.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkInvite = () => {
    if (!activeCompanyId || selected.size === 0) return;
    const list = Array.from(selected)
      .map((id) => inviteWithEmailMap.get(id))
      .filter((e): e is NonNullable<typeof e> => !!e && !!e.email)
      .map((e) => ({ employee_id: e.id, email: e.email!, full_name: e.full_name }));
    if (list.length === 0) {
      toast({ title: "אין נמענים תקפים", description: "לעובדים שנבחרו אין כתובת מייל", variant: "destructive" });
      return;
    }
    inviteMutation.mutate({ company_id: activeCompanyId, employees: list });
  };

  const handleSingleInvite = (emp: { id: string; email: string | null; full_name: string }) => {
    if (!activeCompanyId || !emp.email) return;
    inviteMutation.mutate({
      company_id: activeCompanyId,
      employees: [{ employee_id: emp.id, email: emp.email, full_name: emp.full_name }],
    });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-start justify-between">
          <div className="page-header">
            <h1 className="page-title">ניהול עובדים</h1>
            <p className="page-subtitle">{employees?.length ?? 0} עובדים רשומים במערכת</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => {
              if (!employees?.length) return;
              exportToExcel(employees.map(e => ({
                ...e,
                status_label: statusLabels[e.status as EmployeeStatus] ?? e.status,
                start_date_fmt: new Date(e.start_date).toLocaleDateString("he-IL"),
              })), [
                { key: "employee_code", label: "מזהה עובד" },
                { key: "full_name", label: "שם מלא" },
                { key: "role", label: "תפקיד" },
                { key: "department", label: "מחלקה" },
                { key: "start_date_fmt", label: "תאריך התחלה" },
                { key: "status_label", label: "סטטוס" },
              ], "רשימת_עובדים");
            }}>
              <Download className="w-4 h-4" />
              ייצוא לאקסל
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              יבוא מאקסל
            </Button>
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" />
              עובד חדש
            </Button>
          </div>
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

          {selected.size > 0 && (
            <div className="flex items-center gap-2 mr-auto">
              <span className="text-sm text-muted-foreground">{selected.size} נבחרו</span>
              <Button
                size="sm"
                className="gap-2"
                onClick={handleBulkInvite}
                disabled={inviteMutation.isPending}
              >
                <Send className="w-4 h-4" />
                שלח הזמנות ({selected.size})
              </Button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border/50 shadow-card overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">טוען...</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={selectableInPage.length === 0}
                      aria-label="בחר הכל"
                    />
                  </th>
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
                {filtered.map((emp) => {
                  const hasEmail = !!emp.email;
                  return (
                    <tr key={emp.id}>
                      <td>
                        <Checkbox
                          checked={selected.has(emp.id)}
                          onCheckedChange={() => toggleOne(emp.id)}
                          disabled={!hasEmail}
                          aria-label={`בחר ${emp.full_name}`}
                        />
                      </td>
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
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={!hasEmail || inviteMutation.isPending}
                                  onClick={() => handleSingleInvite(emp)}
                                  aria-label="שלח הזמנה"
                                >
                                  <Mail className="w-4 h-4" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {hasEmail ? "שלח הזמנה למשתמש" : "לעובד אין כתובת מייל"}
                            </TooltipContent>
                          </Tooltip>
                          <Link
                            to={`/employees/${emp.id}`}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground inline-block"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">לא נמצאו עובדים</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
        <ImportExcelDialog open={importOpen} onOpenChange={setImportOpen} mode="employees" />
      </div>
    </TooltipProvider>
  );
}
