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
  dispatchAccess,
  listPickerCatalog,
  listProcessGrants,
  listRequests,
  requestAccess,
  resolveGrant,
  inviteToTiful360,
  listEmployeeGrantHistory,
  listHeldGrants,
  requestRevocation,
  createScanKey,
  getScanStatus,
  revokeScanKey,
  importLegacyAccess,
  type GrantAction,
} from "@/services/systemAccess";
import type { AccessGroup, AccessPick, AccessResource, AccessSystem } from "@/domain/systemAccess/types";
import { accessProtocolId, employeeProtocolRows, type AccessLevel } from "@/domain/systemAccess/protocol";
import { buildAccessProtocolPdf } from "@/lib/pdf/lazy";
import { uploadFile } from "@/lib/uploadWithProgress";

const KEYS = {
  systems: (companyId: string | null) => ["system-access", "systems", companyId] as const,
  resources: (systemId: string | null) => ["system-access", "resources", systemId] as const,
  groups: (systemId: string | null) => ["system-access", "groups", systemId] as const,
  catalog: (companyId: string | null) => ["system-access", "picker-catalog", companyId] as const,
  requests: ["system-access", "requests"] as const,
  processGrants: (processId: string | null) => ["system-access", "requests", "process", processId] as const,
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

/** Groups and top-level resources HR can pick, for every system of the company. */
export function useAccessPickerCatalog() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: KEYS.catalog(activeCompanyId),
    queryFn: () => listPickerCatalog(supabase, activeCompanyId!),
    enabled: !!activeCompanyId,
  });
}

export function useAccessRequests(status: "open" | "done") {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: [...KEYS.requests, activeCompanyId, status],
    queryFn: () => listRequests(supabase, activeCompanyId!, status),
    enabled: !!activeCompanyId,
  });
}

/** Grants requested from one onboarding process. */
export function useProcessAccessGrants(processId: string | null) {
  return useQuery({
    queryKey: KEYS.processGrants(processId),
    queryFn: () => listProcessGrants(supabase, processId!),
    enabled: !!processId,
  });
}

function useInvalidateRequests() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: KEYS.requests });
    qc.invalidateQueries({ queryKey: ["it-tickets"] });
    // A request can join an open onboarding and add to its checklist.
    qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
  };
}

export function useRequestAccess() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ employeeId, picks, onboardingProcessId, note }: {
      employeeId: string; picks: AccessPick[]; onboardingProcessId?: string | null; note?: string | null;
    }) => requestAccess(supabase, employeeId, picks, { onboardingProcessId, note }),
    onSuccess: invalidate,
  });
}

export function useDispatchAccess() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: async ({ grantIds, note }: { grantIds: string[]; note?: string | null }) => {
      const tickets = await dispatchAccess(supabase, grantIds, note);
      // The owner hears about the new ticket by the usual ticket email (IT's list for IT-owned
      // systems, operations otherwise); a failed email does not undo the dispatch.
      await Promise.all(
        tickets.map((t) =>
          supabase.functions
            .invoke("notify-it-ticket", { body: { ticket_id: t.ticketId, ...(t.ownerRole === "it_manager" ? { target: "it" } : {}) } })
            .catch((e) => console.warn("notify-it-ticket failed", e)),
        ),
      );
      return tickets;
    },
    onSuccess: invalidate,
  });
}

export function useResolveGrant() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ grantId, action, executedAt, externalUsername, note }: {
      grantId: string; action: GrantAction; executedAt?: string | null; externalUsername?: string | null; note?: string | null;
    }) => resolveGrant(supabase, grantId, action, { executedAt, externalUsername, note }),
    onSuccess: invalidate,
  });
}

/** Tiful360 opens by itself: invite the employee, then mark the grant done with the address used. */
export function useProvisionTiful360() {
  const invalidate = useInvalidateRequests();
  const { activeCompanyId } = useCompany();
  return useMutation({
    mutationFn: async ({ grantId, employee }: { grantId: string; employee: { id: string; email: string | null; full_name: string } }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const email = await inviteToTiful360(supabase, activeCompanyId, employee);
      await resolveGrant(supabase, grantId, "done", { externalUsername: email, note: "משתמש נפתח והזמנה נשלחה" });
      return email;
    },
    onSuccess: invalidate,
  });
}

/** Who holds which access now, for the matrix. */
export function useHeldGrants() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: [...KEYS.requests, "held", activeCompanyId],
    queryFn: () => listHeldGrants(supabase, activeCompanyId!),
    enabled: !!activeCompanyId,
  });
}

/** One employee's access, past and present, for the protocol. */
export function useEmployeeGrantHistory(employeeId: string | null) {
  return useQuery({
    queryKey: [...KEYS.requests, "employee", employeeId],
    queryFn: () => listEmployeeGrantHistory(supabase, employeeId!),
    enabled: !!employeeId,
  });
}

export function useRequestRevocation() {
  const invalidate = useInvalidateRequests();
  return useMutation({
    mutationFn: ({ employeeId, grantIds, note }: { employeeId: string; grantIds?: string[] | null; note?: string | null }) =>
      requestRevocation(supabase, employeeId, grantIds ?? null, note),
    onSuccess: invalidate,
  });
}

export const ACCESS_PROTOCOL_DOCUMENT_TYPE = "access_protocol";

/**
 * Build the employee's access protocol (every access, by system, with its history), store it in
 * the employee file, and return the PDF so the caller can open or download it.
 */
export function useGenerateAccessProtocol() {
  const qc = useQueryClient();
  const { activeCompanyId, activeCompany } = useCompany();
  return useMutation({
    mutationFn: async ({ employeeId }: { employeeId: string }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const [{ data: emp, error: empErr }, history, { data: auth }] = await Promise.all([
        supabase.from("employees").select("full_name, employee_code, role, department, start_date, end_date").eq("id", employeeId).single(),
        listEmployeeGrantHistory(supabase, employeeId),
        supabase.auth.getUser(),
      ]);
      if (empErr) throw empErr;
      const { data: profile } = auth?.user
        ? await supabase.from("profiles").select("display_name").eq("user_id", auth.user.id).maybeSingle()
        : { data: null };

      const documentId = accessProtocolId(employeeId);
      const blob = await buildAccessProtocolPdf({
        documentId,
        companyName: activeCompany?.name ?? "",
        companyLogoUrl: activeCompany?.logo_url ?? null,
        generatedBy: profile?.display_name || auth?.user?.email || "—",
        employeeName: emp.full_name,
        employeeCode: emp.employee_code ?? null,
        role: emp.role ?? null,
        department: emp.department ?? null,
        startDate: emp.start_date ?? null,
        endDate: (emp as { end_date?: string | null }).end_date ?? null,
        rows: employeeProtocolRows(history),
      });

      const fileName = `${documentId}.pdf`;
      const path = `${activeCompanyId}/${employeeId}/${Date.now()}-${fileName}`;
      const up = await uploadFile("employee-documents", path, blob, { cacheControl: "3600", upsert: false, contentType: "application/pdf" });
      if (up.error) throw up.error;
      const { error: docErr } = await supabase.from("employee_documents").insert({
        employee_id: employeeId,
        company_id: activeCompanyId,
        document_type: ACCESS_PROTOCOL_DOCUMENT_TYPE,
        document_label: "פרוטוקול הרשאות למערכות",
        file_url: path,
        file_name: fileName,
        file_size_bytes: blob.size,
        uploaded_by: auth?.user?.id ?? null,
      });
      if (docErr) throw docErr;
      return { blob, fileName, path };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents"] }),
  });
}

export function useScanStatus(systemId: string | null) {
  return useQuery({
    queryKey: ["system-access", "scan", systemId],
    queryFn: () => getScanStatus(supabase, systemId!),
    enabled: !!systemId,
  });
}

export function useScanKey(systemId: string | null) {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["system-access", "scan", systemId] });
  return {
    create: useMutation({ mutationFn: () => createScanKey(supabase, systemId!), onSuccess: done }),
    revoke: useMutation({ mutationFn: () => revokeScanKey(supabase, systemId!), onSuccess: done }),
  };
}

/** Preview and apply the one-time import of access that existed before this screen. */
export function useLegacyAccessImport() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const run = (apply: boolean) => {
    if (!activeCompanyId) throw new Error("לא נבחרה חברה");
    return importLegacyAccess(supabase, activeCompanyId, apply);
  };
  return {
    preview: useMutation({ mutationFn: () => run(false) }),
    apply: useMutation({
      mutationFn: () => run(true),
      onSuccess: () => qc.invalidateQueries({ queryKey: ["system-access"] }),
    }),
  };
}
