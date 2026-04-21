import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { Users, ShieldCheck, ShieldOff, Ban, CheckCircle, RefreshCw, Upload, UserPlus } from "lucide-react";
import { ImportExcelDialog } from "@/components/ImportExcelDialog";
import { InviteExternalUserDialog } from "@/components/InviteExternalUserDialog";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface ManagedUser {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  banned_until: string | null;
  roles: string[];
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "סופר אדמין",
  admin: "מנהל מערכת",
  it_manager: "מנהל IT",
  operations: "עובד תפעול",
  direct_manager: "מנהל ישיר",
  payroll: "חשב/ת שכר",
  employee: "עובד",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-primary/10 text-primary border-primary/20",
  admin: "bg-destructive/10 text-destructive border-destructive/20",
  it_manager: "bg-accent text-accent-foreground border-accent",
  operations: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400",
  direct_manager: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400",
  payroll: "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400",
  employee: "bg-secondary text-secondary-foreground border-secondary",
};

// Roles that operations users cannot grant or revoke
const OPERATIONS_RESTRICTED_ROLES = new Set(["super_admin", "admin", "payroll"]);

async function fetchUsers(companyId: string | null): Promise<ManagedUser[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ action: "list" });
  if (companyId) params.set("company_id", companyId);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch users");
  }
  return res.json();
}

export function UsersAndRolesTab() {
  const { toast } = useToast();
  const { user: currentUser, isAdmin, isSuperAdmin, isOperations } = useAuth();
  const { activeCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);

  // Operations-only users (no admin/super_admin) cannot manage sensitive roles
  const restrictRoles = isOperations && !isAdmin && !isSuperAdmin;

  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: ["managed-users", activeCompanyId],
    queryFn: () => fetchUsers(activeCompanyId),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ user_id, role, remove }: { user_id: string; role: string; remove: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=set-role`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ user_id, role, remove }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast({ title: "התפקיד עודכן בהצלחה" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה בעדכון תפקיד", description: err.message, variant: "destructive" });
    },
  });

  const banMutation = useMutation({
    mutationFn: async ({ user_id, ban }: { user_id: string; ban: boolean }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?action=ban`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ user_id, ban }),
        }
      );
      if (!res.ok) throw new Error((await res.json()).error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast({ title: "סטטוס המשתמש עודכן" });
    },
    onError: (err: any) => {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    },
  });

  const handleRoleChange = (userId: string, currentRoles: string[], newRole: string) => {
    const has = currentRoles.includes(newRole);
    roleMutation.mutate({ user_id: userId, role: newRole, remove: has });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">משתמשים ותפקידים</h2>
          <p className="text-sm text-muted-foreground">צפייה, שינוי תפקידים והשהיית חשבונות</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          רענון
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סה"כ משתמשים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">מנהלים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {users.filter((u) => u.roles.includes("admin")).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">מושהים</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {users.filter((u) => u.banned).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-start">משתמש</TableHead>
                <TableHead className="text-start">ספק אימות</TableHead>
                <TableHead className="text-start">תפקידים</TableHead>
                <TableHead className="text-start">כניסה אחרונה</TableHead>
                <TableHead className="text-start">סטטוס</TableHead>
                <TableHead className="text-start">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    טוען משתמשים...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    לא נמצאו משתמשים
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id} className={u.banned ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={u.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {(u.full_name || u.email || "?").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm text-foreground">{u.full_name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.email || u.phone || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {u.provider}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">ללא תפקיד</span>
                        ) : (
                          u.roles.map((r) => (
                            <Badge key={r} variant="outline" className={`text-xs ${ROLE_COLORS[r] || ""}`}>
                              {ROLE_LABELS[r] || r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_sign_in_at
                        ? format(new Date(u.last_sign_in_at), "dd/MM/yyyy HH:mm", { locale: he })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {u.banned ? (
                        <Badge variant="destructive" className="text-xs">מושהה</Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success border-success/20 text-xs">פעיל</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          onValueChange={(role) => handleRoleChange(u.id, u.roles, role)}
                        >
                          <SelectTrigger className="w-[130px] h-8 text-xs">
                            <SelectValue placeholder="שנה תפקיד" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(ROLE_LABELS)
                              .filter(([key]) => !restrictRoles || !OPERATIONS_RESTRICTED_ROLES.has(key))
                              .map(([key, label]) => (
                                <SelectItem key={key} value={key} className="text-xs">
                                  {u.roles.includes(key) ? `הסר: ${label}` : `הוסף: ${label}`}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>

                        {u.id !== currentUser?.id && (
                          <Button
                            variant={u.banned ? "outline" : "destructive"}
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={() => banMutation.mutate({ user_id: u.id, ban: !u.banned })}
                            disabled={banMutation.isPending}
                          >
                            {u.banned ? (
                              <>
                                <CheckCircle className="w-3 h-3" />
                                הפעל
                              </>
                            ) : (
                              <>
                                <Ban className="w-3 h-3" />
                                השהה
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ImportExcelDialog open={importOpen} onOpenChange={setImportOpen} mode="employees" />
    </div>
  );
}
