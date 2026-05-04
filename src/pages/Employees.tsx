import { useState, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Search, Plus, Download, UserMinus, Upload, Mail, Send, ShieldCheck, ShieldAlert, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useEmployees } from "@/hooks/useData";
import { useUpdateEmployee } from "@/hooks/useMutations";
import { AddEmployeeDialog } from "@/components/AddEmployeeDialog";
import { ImportExcelDialog } from "@/components/ImportExcelDialog";
import { UsersAndRolesTab } from "@/components/UsersAndRolesTab";
import { useAuth } from "@/hooks/useAuth";
import { exportToExcel } from "@/lib/exportExcel";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  role?: string;
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
      body: JSON.stringify({ ...payload, role: payload.role || "employee" }),
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
  const updateEmployee = useUpdateEmployee();
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const canManageUsers = isAdmin || isSuperAdmin;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "users" && canManageUsers ? "users" : "employees";
  const [tab, setTab] = useState<"employees" | "users">(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "users" && tab !== "users") setTab("users");
    if ((!t || t === "employees") && tab !== "employees") setTab("employees");
  }, [searchParams]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | "all">("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch full employee rows (needed for email + exclude_from_contacts + linked_user_id + direct_manager_id)
  const { data: fullRows } = useQuery({
    queryKey: ["employees-full", activeCompanyId],
    queryFn: async () => {
      let q = supabase.from("employees").select("id,email,linked_user_id,exclude_from_contacts,direct_manager_id");
      if (activeCompanyId) q = q.eq("company_id", activeCompanyId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Array<{
        id: string; email: string | null; linked_user_id: string | null;
        exclude_from_contacts: boolean | null; direct_manager_id: string | null;
      }>;
    },
    enabled: !!activeCompanyId,
  });

  const fullById = useMemo(() => {
    const m = new Map<string, NonNullable<typeof fullRows>[number]>();
    for (const r of fullRows ?? []) m.set(r.id, r);
    return m;
  }, [fullRows]);


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
      queryClient.invalidateQueries({ queryKey: ["employees-full"] });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה בשליחת הזמנות", description: err.message, variant: "destructive" });
    },
  });

  const selectableInPage = filtered.filter((e) => !!fullById.get(e.id)?.email);
  const allSelected = selectableInPage.length > 0 && selectableInPage.every((e) => selected.has(e.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableInPage.map((e) => e.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const empById = useMemo(() => new Map((employees ?? []).map((e) => [e.id, e])), [employees]);

  const managerOptions = useMemo(() => {
    const opts = (employees ?? [])
      .filter((e) => e.status === "active")
      .map((e) => ({ value: e.id, label: `${e.full_name}${e.role ? ` — ${e.role}` : ""}` }));
    return [{ value: "__none__", label: "ללא מנהל" }, ...opts];
  }, [employees]);

  const handleManagerChange = async (employeeId: string, newManagerId: string) => {
    try {
      await updateEmployee.mutateAsync({
        id: employeeId,
        direct_manager_id: newManagerId === "__none__" ? null : newManagerId,
      });
      toast({ title: "מנהל ישיר עודכן" });
      queryClient.invalidateQueries({ queryKey: ["employees-full"] });
    } catch (e: any) {
      toast({ title: "שגיאה בעדכון", description: e.message, variant: "destructive" });
    }
  };

  const handleBulkInvite = () => {
    if (!activeCompanyId || selected.size === 0) return;
    const list = Array.from(selected)
      .map((id) => {
        const emp = empById.get(id);
        const email = fullById.get(id)?.email;
        if (!emp || !email) return null;
        return { employee_id: emp.id, email, full_name: emp.full_name };
      })
      .filter((x): x is { employee_id: string; email: string; full_name: string } => !!x);
    if (list.length === 0) {
      toast({ title: "אין נמענים תקפים", description: "לעובדים שנבחרו אין כתובת מייל", variant: "destructive" });
      return;
    }
    inviteMutation.mutate({ company_id: activeCompanyId, employees: list });
  };

  const handleSingleInvite = (empId: string, fullName: string) => {
    const email = fullById.get(empId)?.email;
    if (!activeCompanyId || !email) return;
    inviteMutation.mutate({
      company_id: activeCompanyId,
      employees: [{ employee_id: empId, email, full_name: fullName }],
    });
  };

  const switchTab = (v: string) => {
    const newTab = v === "users" ? "users" : "employees";
    setTab(newTab);
    const sp = new URLSearchParams(searchParams);
    if (newTab === "users") sp.set("tab", "users"); else sp.delete("tab");
    setSearchParams(sp, { replace: true });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">ניהול עובדים ומשתמשים</h1>
          <p className="page-subtitle">{employees?.length ?? 0} עובדים רשומים במערכת</p>
        </div>

        <Tabs value={tab} onValueChange={switchTab} dir="rtl">
          <TabsList>
            <TabsTrigger value="employees">עובדים</TabsTrigger>
            {canManageUsers && <TabsTrigger value="users">משתמשים ותפקידים</TabsTrigger>}
          </TabsList>

          <TabsContent value="employees" className="space-y-4 mt-4">
            <div className="flex items-start justify-between">
              <div />
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

              {canManageUsers && selected.size > 0 && (
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
                      {canManageUsers && (
                        <th className="w-10">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleAll}
                            disabled={selectableInPage.length === 0}
                            aria-label="בחר הכל"
                          />
                        </th>
                      )}
                      <th>מזהה</th>
                      <th>שם מלא</th>
                      <th>תפקיד</th>
                      <th>מחלקה</th>
                      <th className="min-w-[200px]">מנהל ישיר</th>
                      {canManageUsers && <th>גישה למערכת</th>}
                      <th>בקשר</th>
                      <th>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((emp) => {
                      const full = fullById.get(emp.id);
                      const hasEmail = !!full?.email;
                      const hasAccount = !!full?.linked_user_id;
                      const inContacts = !full?.exclude_from_contacts;
                      const currentManagerId = full?.direct_manager_id ?? "__none__";
                      return (
                        <tr
                          key={emp.id}
                          onClick={() => navigate(`/employees/${emp.id}`)}
                          className="cursor-pointer hover:bg-muted/50"
                        >
                          {canManageUsers && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={selected.has(emp.id)}
                                onCheckedChange={() => toggleOne(emp.id)}
                                disabled={!hasEmail}
                                aria-label={`בחר ${emp.full_name}`}
                              />
                            </td>
                          )}
                          <td className="font-mono text-xs text-muted-foreground">{emp.employee_code}</td>
                          <td className="font-medium">{emp.full_name}</td>
                          <td>{emp.role}</td>
                          <td>{emp.department}</td>
                          <td onClick={(e) => e.stopPropagation()} className="min-w-[200px]">
                            <SearchableSelect
                              value={currentManagerId}
                              onChange={(v) => handleManagerChange(emp.id, v)}
                              options={managerOptions.filter((o) => o.value !== emp.id)}
                              placeholder="ללא מנהל"
                              searchPlaceholder="חיפוש מנהל..."
                              emptyText="לא נמצאו עובדים"
                              className="h-8 text-xs"
                            />
                          </td>
                          {canManageUsers && (
                            <td onClick={(e) => e.stopPropagation()}>
                              {hasAccount ? (
                                <Badge variant="outline" className="gap-1 text-[11px] bg-success/10 text-success border-success/20">
                                  <ShieldCheck className="w-3 h-3" />
                                  פעיל
                                </Badge>
                              ) : hasEmail ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] gap-1"
                                  disabled={inviteMutation.isPending}
                                  onClick={() => handleSingleInvite(emp.id, emp.full_name)}
                                >
                                  <Mail className="w-3 h-3" />
                                  צור חשבון
                                </Button>
                              ) : (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <ShieldAlert className="w-3 h-3" />
                                      אין מייל
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>הוסף כתובת מייל לעובד כדי ליצור חשבון</TooltipContent>
                                </Tooltip>
                              )}
                            </td>
                          )}
                          <td>
                            {inContacts ? (
                              <UserCheck className="w-4 h-4 text-success" />
                            ) : (
                              <UserX className="w-4 h-4 text-muted-foreground" />
                            )}
                          </td>
                          <td>
                            <span className={`status-badge ${statusClasses[emp.status as EmployeeStatus] ?? "status-inactive"}`}>
                              {emp.status === "leaving" && <UserMinus className="w-3 h-3" />}
                              {statusLabels[emp.status as EmployeeStatus] ?? emp.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr><td colSpan={canManageUsers ? 9 : 7} className="text-center py-8 text-muted-foreground">לא נמצאו עובדים</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="users" className="mt-4">
              <UsersAndRolesTab />
            </TabsContent>
          )}
        </Tabs>

        <AddEmployeeDialog open={addOpen} onOpenChange={setAddOpen} />
        <ImportExcelDialog open={importOpen} onOpenChange={setImportOpen} mode="employees" />
      </div>
    </TooltipProvider>
  );
}
