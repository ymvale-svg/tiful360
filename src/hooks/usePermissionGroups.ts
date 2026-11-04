import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useAuth";
import type { PermissionGroup, PermissionGroupMember } from "@/lib/permissionGroups";

// The generated Database types predate these tables.
const groupsTable = () => supabase.from("permission_groups" as any) as any;
const membersTable = () => supabase.from("permission_group_members" as any) as any;

export function usePermissionGroups(companyId: string | null) {
  return useQuery({
    queryKey: ["permission-groups", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PermissionGroup[]> => {
      const { data, error } = await groupsTable()
        .select("id, company_id, name, description, roles, system_key, created_at")
        .eq("company_id", companyId)
        .order("system_key", { ascending: true, nullsFirst: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroupMembers(companyId: string | null) {
  return useQuery({
    queryKey: ["permission-group-members", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<PermissionGroupMember[]> => {
      const { data, error } = await membersTable()
        .select("id, group_id, user_id, company_id, created_at")
        .eq("company_id", companyId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useInvalidateGroups() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["permission-groups"] });
    qc.invalidateQueries({ queryKey: ["permission-group-members"] });
    qc.invalidateQueries({ queryKey: ["managed-users"] });
    qc.invalidateQueries({ queryKey: ["my-group-roles"] });
  };
}

export interface GroupInput {
  name: string;
  description: string | null;
  roles: AppRole[];
}

export function useSaveGroup(companyId: string | null) {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: async ({ id, ...input }: GroupInput & { id?: string }) => {
      if (!companyId) throw new Error("לא נבחרה חברה");
      const { error } = id
        ? await groupsTable().update(input).eq("id", id)
        : await groupsTable().insert({ ...input, company_id: companyId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await groupsTable().delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetGroupMembership() {
  const invalidate = useInvalidateGroups();
  return useMutation({
    mutationFn: async ({ groupId, userId, member }: { groupId: string; userId: string; member: boolean }) => {
      // company_id is overwritten by the DB trigger from the group; sent only to satisfy NOT NULL typing.
      const { data: group, error: gErr } = await groupsTable().select("company_id").eq("id", groupId).single();
      if (gErr) throw gErr;
      const { error } = member
        ? await membersTable().insert({ group_id: groupId, user_id: userId, company_id: group.company_id })
        : await membersTable().delete().eq("group_id", groupId).eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
