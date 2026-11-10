import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/ui/search-input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormField, focusFirstInvalid } from "@/components/feedback/FormField";
import { IconButton } from "@/components/feedback/IconButton";
import { StateView } from "@/components/feedback/StateView";
import { useConfirm } from "@/components/feedback/ConfirmDialog";
import { useDirtyGuard } from "@/components/feedback/useDirtyGuard";
import { undoToast } from "@/components/feedback/undoToast";
import { useToast } from "@/hooks/use-toast";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  useDeleteGroup, useGroupMembers, usePermissionGroups, useSaveGroup, useSetGroupMembership,
} from "@/hooks/usePermissionGroups";
import {
  ADMIN_ASSIGNABLE_ROLES, GRANTABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, canGrantRoles,
  type PermissionGroup,
} from "@/lib/permissionGroups";
import { fetchManagedUsers } from "@/lib/managedUsers";

/**
 * Company permission groups. Every company starts with the default groups (one per role);
 * a system admin adds custom groups and assigns users. Access in one company never carries
 * over to another.
 */
export function PermissionGroupsTab() {
  const { isAdmin, isSuperAdmin } = useAuth();
  const { activeCompanyId, activeCompany } = useCompany();
  const { toast } = useToast();
  const confirm = useConfirm();
  const groupsQuery = usePermissionGroups(activeCompanyId);
  const membersQuery = useGroupMembers(activeCompanyId);
  const deleteGroup = useDeleteGroup();
  const [editing, setEditing] = useState<PermissionGroup | "new" | null>(null);
  const [membersOf, setMembersOf] = useState<PermissionGroup | null>(null);

  const groups = groupsQuery.data ?? [];
  const memberCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of membersQuery.data ?? []) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
    return counts;
  }, [membersQuery.data]);

  const handleDelete = (g: PermissionGroup) =>
    confirm({
      title: `למחוק את הקבוצה "${g.name}"?`,
      description: `${memberCount.get(g.id) ?? 0} משתמשים יאבדו את ההרשאות שהקבוצה נותנת בחברה זו. השינוי נרשם ביומן ההרשאות.`,
      confirmLabel: "מחק קבוצה",
      destructive: true,
      // Errors stay in the dialog (ConfirmDialog shows them); success closes it.
      onConfirm: async () => {
        await deleteGroup.mutateAsync(g.id);
        toast({ title: "הקבוצה נמחקה" });
      },
    });

  if (!activeCompanyId) {
    return <p className="text-sm text-muted-foreground">בחרו חברה כדי לנהל את קבוצות ההרשאה שלה.</p>;
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">קבוצות והרשאות</h2>
          <p className="text-sm text-muted-foreground">
            ההרשאות של {activeCompany?.name ?? "החברה"} בלבד. קבוצות ברירת המחדל קיימות בכל חברה; אפשר להוסיף קבוצות
            ולשייך אליהן משתמשים.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setEditing("new")} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden="true" />
            קבוצה חדשה
          </Button>
        )}
      </div>

      <StateView
        loading={groupsQuery.isLoading}
        error={groupsQuery.error}
        onRetry={() => groupsQuery.refetch()}
        isEmpty={groups.length === 0}
        label="קבוצות הרשאה"
        empty={{
          title: "אין קבוצות הרשאה בחברה זו",
          description: "קבוצות ברירת המחדל נוצרות עם החברה. אם הן חסרות, ייתכן שעדכון בסיס הנתונים טרם הוחל.",
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">קבוצה</TableHead>
              <TableHead className="text-start">הרשאות</TableHead>
              <TableHead className="text-start">משתמשים</TableHead>
              <TableHead className="text-start">פעולות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const grantable = canGrantRoles(g.roles, isSuperAdmin);
              return (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{g.name}</span>
                      {g.system_key && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Lock className="h-3 w-3" aria-hidden="true" />
                          ברירת מחדל
                        </Badge>
                      )}
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {g.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">ללא הרשאות</span>
                      ) : (
                        g.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-xs">{ROLE_LABELS[r] ?? r}</Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums">{memberCount.get(g.id) ?? 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => setMembersOf(g)}
                        aria-label={`משתמשים בקבוצה ${g.name}`}
                      >
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        משתמשים
                      </Button>
                      {isAdmin && grantable && (
                        <IconButton label={`עריכת הקבוצה ${g.name}`} onClick={() => setEditing(g)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                      )}
                      {isAdmin && grantable && !g.system_key && (
                        <IconButton label={`מחיקת הקבוצה ${g.name}`} onClick={() => void handleDelete(g)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </IconButton>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </StateView>

      {!isSuperAdmin && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          הרשאות ניהול, שכר, משאבי אנוש, IT, הנהלה ומזכירות ניתנות לשיוך על ידי סופר אדמין בלבד.
        </p>
      )}

      {editing && (
        <GroupDialog
          group={editing === "new" ? null : editing}
          companyId={activeCompanyId}
          onClose={() => setEditing(null)}
        />
      )}
      {membersOf && (
        <MembersDialog group={membersOf} companyId={activeCompanyId} onClose={() => setMembersOf(null)} />
      )}
    </div>
  );
}

function GroupDialog({ group, companyId, onClose }: { group: PermissionGroup | null; companyId: string; onClose: () => void }) {
  const { isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const save = useSaveGroup(companyId);
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [roles, setRoles] = useState<AppRole[]>(group?.roles ?? []);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !!group?.system_key;

  const dirty =
    name !== (group?.name ?? "") ||
    description !== (group?.description ?? "") ||
    roles.join() !== (group?.roles ?? []).join();
  const guard = useDirtyGuard(dirty, save.isPending);

  const toggleRole = (role: AppRole, on: boolean) =>
    setRoles((prev) => (on ? [...prev, role] : prev.filter((r) => r !== role)).sort());

  const submit = async () => {
    if (!name.trim()) {
      setError("נא להזין שם לקבוצה");
      focusFirstInvalid();
      return;
    }
    try {
      await save.mutateAsync({
        id: group?.id,
        name: name.trim(),
        description: description.trim() || null,
        // Default groups keep their permissions; the DB rejects changes to them.
        roles: isSystem ? group!.roles : roles,
      });
      toast({ title: group ? "הקבוצה עודכנה" : "הקבוצה נוצרה" });
      onClose();
    } catch (err: any) {
      const duplicate = String(err?.message ?? "").includes("permission_groups_company_name_key");
      toast({
        title: "השמירה נכשלה",
        description: duplicate ? "כבר קיימת קבוצה בשם הזה בחברה." : err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open onOpenChange={guard((open) => !open && onClose())}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? `עריכת הקבוצה ${group.name}` : "קבוצת הרשאה חדשה"}</DialogTitle>
          <DialogDescription>הקבוצה חלה על החברה הנוכחית בלבד.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FormField label="שם הקבוצה" required error={error ?? undefined}>
            <Input value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(null); }} />
          </FormField>
          <FormField label="תיאור" hint="למה הקבוצה משמשת (לא חובה)">
            <Textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">הרשאות</legend>
            {isSystem && (
              <p className="text-xs text-muted-foreground">ההרשאות של קבוצת ברירת מחדל קבועות; אפשר לשנות שם ותיאור.</p>
            )}
            <div className="grid gap-2">
              {GRANTABLE_ROLES.map((role) => {
                const allowed = isSuperAdmin || ADMIN_ASSIGNABLE_ROLES.includes(role);
                const id = `role-${role}`;
                return (
                  <div key={role} className="flex items-start gap-2">
                    <Checkbox
                      id={id}
                      checked={roles.includes(role)}
                      disabled={isSystem || !allowed}
                      onCheckedChange={(v) => toggleRole(role, v === true)}
                    />
                    <label htmlFor={id} className="text-sm leading-tight">
                      <span className="font-medium">{ROLE_LABELS[role]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_DESCRIPTIONS[role]}
                        {!allowed && " · סופר אדמין בלבד"}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => guard((open) => !open && onClose())(false)} disabled={save.isPending}>
            ביטול
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? "שומר..." : "שמירה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ group, companyId, onClose }: { group: PermissionGroup; companyId: string; onClose: () => void }) {
  const { user, isSuperAdmin, isAdmin, isHR, isPayroll } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const usersQuery = useQuery({ queryKey: ["managed-users", companyId], queryFn: () => fetchManagedUsers(companyId) });
  const membersQuery = useGroupMembers(companyId);
  const setMembership = useSetGroupMembership();
  const canEdit = (isAdmin || isHR || isPayroll) && canGrantRoles(group.roles, isSuperAdmin);

  const memberIds = useMemo(
    () => new Set((membersQuery.data ?? []).filter((m) => m.group_id === group.id).map((m) => m.user_id)),
    [membersQuery.data, group.id],
  );
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const users = (usersQuery.data ?? [])
    .filter((u) => terms.every((t) => [u.full_name, u.email].some((f) => (f ?? "").toLowerCase().includes(t))))
    .sort((a, b) => Number(memberIds.has(b.id)) - Number(memberIds.has(a.id)) || (a.full_name ?? "").localeCompare(b.full_name ?? "", "he"));

  const toggle = async (userId: string, name: string, member: boolean) => {
    try {
      await setMembership.mutateAsync({ groupId: group.id, userId, member });
      if (member) {
        toast({ title: `${name} שויך לקבוצה` });
      } else {
        undoToast(`${name} הוסר מהקבוצה`, {
          onUndo: () => setMembership.mutateAsync({ groupId: group.id, userId, member: true }),
        });
      }
    } catch (err: any) {
      toast({ title: "העדכון נכשל", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>משתמשים בקבוצה {group.name}</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "סמנו משתמשים כדי לשייך אותם. השינוי חל מיד ונרשם ביומן ההרשאות."
              : "צפייה בלבד: אין לכם הרשאה לשנות את החברים בקבוצה זו."}
          </DialogDescription>
        </DialogHeader>
        <SearchInput label="חיפוש משתמשים" placeholder="חיפוש לפי שם או דוא״ל" value={search} onValueChange={setSearch} />
        <StateView
          loading={usersQuery.isLoading || membersQuery.isLoading}
          error={usersQuery.error ?? membersQuery.error}
          onRetry={() => { usersQuery.refetch(); membersQuery.refetch(); }}
          isEmpty={users.length === 0}
          label="משתמשים"
          empty={{ title: search ? "אין משתמשים שתואמים לחיפוש" : "אין משתמשים בחברה זו" }}
        >
          <ul className="max-h-[50vh] divide-y overflow-y-auto">
            {users.map((u) => {
              const name = u.full_name || u.email || "משתמש";
              const id = `member-${u.id}`;
              const self = u.id === user?.id && !isSuperAdmin;
              return (
                <li key={u.id} className="flex items-center gap-3 py-2">
                  <Checkbox
                    id={id}
                    checked={memberIds.has(u.id)}
                    disabled={!canEdit || self || setMembership.isPending}
                    onCheckedChange={(v) => void toggle(u.id, name, v === true)}
                  />
                  <label htmlFor={id} className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {u.email}
                      {self && " · לא ניתן לשנות את ההרשאות של עצמך"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </StateView>
      </DialogContent>
    </Dialog>
  );
}
