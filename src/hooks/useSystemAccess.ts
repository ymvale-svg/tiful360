import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  addResource,
  importTree,
  listGroups,
  listResources,
  listSystems,
  saveGroup,
  saveSystem,
  setGroupResource,
  setResourceActive,
} from "@/services/systemAccess";
import type { AccessGroup, AccessResource, AccessSystem } from "@/domain/systemAccess/types";
import type { AccessLevel } from "@/domain/systemAccess/protocol";

const KEYS = {
  systems: (companyId: string | null) => ["system-access", "systems", companyId] as const,
  resources: (systemId: string | null) => ["system-access", "resources", systemId] as const,
  groups: (systemId: string | null) => ["system-access", "groups", systemId] as const,
};

export function useAccessSystems() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: KEYS.systems(activeCompanyId),
    queryFn: () => listSystems(supabase, activeCompanyId!),
    enabled: !!activeCompanyId,
  });
}

export function useSaveAccessSystem() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: (system: Partial<AccessSystem> & Pick<AccessSystem, "name">) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      return saveSystem(supabase, activeCompanyId, system);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.systems(activeCompanyId) }),
  });
}

export function useAccessResources(systemId: string | null) {
  return useQuery({
    queryKey: KEYS.resources(systemId),
    queryFn: () => listResources(supabase, systemId!),
    enabled: !!systemId,
  });
}

export function useAddAccessResource(systemId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, parent }: { name: string; parent?: Pick<AccessResource, "id" | "path"> | null }) =>
      addResource(supabase, systemId!, name, parent),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.resources(systemId) }),
  });
}

export function useSetAccessResourceActive(systemId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, isActive }: { resourceId: string; isActive: boolean }) =>
      setResourceActive(supabase, resourceId, isActive),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.resources(systemId) }),
  });
}

export function useImportAccessTree(systemId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) => importTree(supabase, systemId!, paths),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.resources(systemId) }),
  });
}

export function useAccessGroups(systemId: string | null) {
  return useQuery({
    queryKey: KEYS.groups(systemId),
    queryFn: () => listGroups(supabase, systemId!),
    enabled: !!systemId,
  });
}

export function useSaveAccessGroup(systemId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (group: Pick<AccessGroup, "name"> & Partial<Pick<AccessGroup, "id" | "external_name" | "description" | "is_active">>) =>
      saveGroup(supabase, systemId!, group),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.groups(systemId) }),
  });
}

export function useSetGroupResource(systemId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, resourceId, level }: { groupId: string; resourceId: string; level: AccessLevel | null }) =>
      setGroupResource(supabase, groupId, resourceId, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.groups(systemId) }),
  });
}
