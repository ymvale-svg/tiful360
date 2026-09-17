import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useSlaSettings } from "@/hooks/useServiceTickets";
import {
  generateTicketCode,
  resolveSlaHours,
  slaDeadlineFrom,
  ONBOARDING_SUBJECT,
} from "@/lib/serviceTickets";
import { OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import {
  buildOnboardingProtocolPdf,
  type OnboardingProtocolItem,
  type OnboardingAuditEntry,
} from "@/lib/pdf/buildOnboardingProtocolPdf";

const ITEM_KIND_LABEL: Record<string, string> = {
  asset: "חומרה / ציוד",
  access: "הרשאה דיגיטלית",
  license: "רישיון / תוכנה",
  subscription: "מנוי",
};

export const ONBOARDING_DOCUMENT_TYPE = "onboarding_protocol";

export function onboardingDocumentId(processId: string, version: number) {
  return `ONB-${processId.slice(0, 8).toUpperCase()}-V${version}`;
}

async function currentUserLabel(): Promise<{ name: string; role: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { name: "—", role: null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", uid)
    .maybeSingle();
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
  const role = roles?.[0]?.role ? OWNER_ROLE_LABEL[roles[0].role as string] ?? null : null;
  return { name: profile?.display_name || auth.user.email || "—", role };
}

interface BuildResult {
  path: string;
  documentId: string;
  fileName: string;
}

/** Generates the onboarding protocol PDF, stores it in the employee file and returns its path. */
async function generateProtocol(params: {
  processId: string;
  version: number;
  companyId: string;
  companyName: string;
  companyLogoUrl?: string | null;
  signature?: string | null;
}): Promise<BuildResult> {
  const { data: proc, error } = await supabase
    .from("onboarding_processes")
    .select(
      "*, employees(full_name, employee_code, id_number, role, department, start_date, direct_manager_id), onboarding_items(*)"
    )
    .eq("id", params.processId)
    .single();
  if (error) throw error;

  const p: any = proc;
  const items: any[] = [...(p.onboarding_items ?? [])].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at))
  );

  const catIds = Array.from(new Set(items.map((i) => i.catalog_ref_id).filter(Boolean)));
  const groupIds = Array.from(new Set(items.map((i) => i.selected_group_id).filter(Boolean)));
  const assetIds = Array.from(new Set(items.map((i) => i.asset_id).filter(Boolean)));

  const [cats, groups, assets, manager] = await Promise.all([
    catIds.length
      ? supabase.from("asset_categories").select("id, category_name, domain").in("id", catIds)
      : Promise.resolve({ data: [] as any[] }),
    groupIds.length
      ? supabase.from("asset_groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] as any[] }),
    assetIds.length
      ? supabase.from("assets").select("id, asset_name, asset_code, serial_number").in("id", assetIds)
      : Promise.resolve({ data: [] as any[] }),
    p.employees?.direct_manager_id
      ? supabase.from("employees").select("full_name").eq("id", p.employees.direct_manager_id).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const catById = new Map((cats.data ?? []).map((c: any) => [c.id, c]));
  const groupById = new Map((groups.data ?? []).map((g: any) => [g.id, g]));
  const assetById = new Map((assets.data ?? []).map((a: any) => [a.id, a]));

  const protocolItems: OnboardingProtocolItem[] = items.map((i) => {
    const cat: any = catById.get(i.catalog_ref_id);
    const group: any = groupById.get(i.selected_group_id);
    const asset: any = assetById.get(i.asset_id);
    return {
      title: i.title,
      kind: ITEM_KIND_LABEL[i.item_type] ?? i.item_type ?? "—",
      category: cat?.category_name ?? "כללי",
      subCategory: group?.name ?? null,
      owner: OWNER_ROLE_LABEL[i.owner_role] ?? i.owner_role ?? "—",
      notes: i.notes ?? null,
      assetCode: asset?.asset_code ?? null,
      serialNumber: asset?.serial_number ?? null,
      assignedAt: i.assigned_at ?? i.completed_at ?? null,
    };
  });

  const auditLog: OnboardingAuditEntry[] = Array.isArray(p.audit_log) ? (p.audit_log as any[]) : [];
  const me = await currentUserLabel();
  const documentId = onboardingDocumentId(params.processId, params.version);

  const blob = await buildOnboardingProtocolPdf({
    documentId,
    version: params.version,
    companyName: params.companyName,
    companyLogoUrl: params.companyLogoUrl,
    generatedBy: me.name,
    generatedByRole: me.role,
    employeeName: p.employees?.full_name ?? "—",
    employeeCode: p.employees?.employee_code ?? null,
    idNumber: p.employees?.id_number ?? null,
    role: p.employees?.role ?? null,
    department: p.employees?.department ?? null,
    managerName: (manager as any)?.data?.full_name ?? null,
    startDate: p.employees?.start_date ?? null,
    items: protocolItems,
    auditLog,
    requesterSignature: params.signature ?? null,
  });

  const fileName = `${documentId}.pdf`;
  const path = `${params.companyId}/${p.employee_id}/${Date.now()}-${fileName}`;
  const up = await supabase.storage
    .from("employee-documents")
    .upload(path, blob, { cacheControl: "3600", upsert: false, contentType: "application/pdf" });
  if (up.error) throw up.error;

  const { data: auth } = await supabase.auth.getUser();
  const { error: docErr } = await supabase.from("employee_documents" as any).insert({
    employee_id: p.employee_id,
    company_id: params.companyId,
    document_type: ONBOARDING_DOCUMENT_TYPE,
    document_label: `פרוטוקול קליטה — גרסה ${params.version}`,
    file_url: path,
    file_name: fileName,
    file_size_bytes: blob.size,
    uploaded_by: auth?.user?.id ?? null,
  } as any);
  if (docErr) throw docErr;

  return { path, documentId, fileName };
}

/** Append an entry to the process audit log. */
export async function appendOnboardingAudit(processId: string, action: string) {
  const me = await currentUserLabel();
  const { data } = await supabase
    .from("onboarding_processes")
    .select("audit_log")
    .eq("id", processId)
    .maybeSingle();
  const log: any[] = Array.isArray((data as any)?.audit_log) ? ((data as any).audit_log as any[]) : [];
  log.push({ at: new Date().toISOString(), by: me.name, action });
  await supabase
    .from("onboarding_processes")
    .update({ audit_log: log.slice(-200) } as any)
    .eq("id", processId);
}

/** Produce + store the request protocol, open the service ticket and notify ops/IT/HR. */
export function useSendOnboardingToOps() {
  const qc = useQueryClient();
  const { activeCompanyId, activeCompany } = useCompany();
  const { data: slaSettings } = useSlaSettings();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      processId,
      employeeId,
      signature,
    }: {
      processId: string;
      employeeId: string;
      signature?: string | null;
    }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");

      await appendOnboardingAudit(processId, "הטופס נשלח לתפעול והופק פרוטוקול בקשה (גרסה 1)");

      const built = await generateProtocol({
        processId,
        version: 1,
        companyId: activeCompanyId,
        companyName: activeCompany?.name ?? "",
        companyLogoUrl: (activeCompany as any)?.logo_url ?? null,
        signature,
      });

      // Items summary for the ticket body
      const { data: itemRows } = await supabase
        .from("onboarding_items")
        .select("title, owner_role, notes")
        .eq("process_id", processId);
      const { data: emp } = await supabase
        .from("employees")
        .select("full_name, start_date")
        .eq("id", employeeId)
        .maybeSingle();

      const description = [
        `בקשת פתיחת הרשאות וציוד לעובד/ת ${emp?.full_name ?? ""}`,
        emp?.start_date ? `תאריך תחילת עבודה: ${new Date(emp.start_date).toLocaleDateString("en-GB")}` : "",
        `מזהה פרוטוקול: ${built.documentId}`,
        "",
        ...(itemRows ?? []).map(
          (i: any) =>
            `• ${i.title} — אחראי: ${OWNER_ROLE_LABEL[i.owner_role] ?? i.owner_role}${i.notes ? ` (${i.notes})` : ""}`
        ),
      ]
        .filter(Boolean)
        .join("\n");

      const hours = resolveSlaHours(slaSettings, ONBOARDING_SUBJECT, "medium");
      const { data: ticket, error: ticketErr } = await supabase
        .from("it_tickets")
        .insert({
          company_id: activeCompanyId,
          employee_id: employeeId,
          ticket_code: generateTicketCode(),
          title: `קליטת עובד — ${emp?.full_name ?? ""}`,
          description,
          subject_category: ONBOARDING_SUBJECT,
          ticket_type: "onboarding" as any,
          priority: "medium" as any,
          status: "open" as any,
          sla_deadline: slaDeadlineFrom(hours),
        })
        .select("id")
        .single();
      if (ticketErr) throw ticketErr;

      const { error: updErr } = await supabase
        .from("onboarding_processes")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          it_ticket_id: ticket.id,
          protocol_version: 1,
          pdf_url: built.path,
        } as any)
        .eq("id", processId);
      if (updErr) throw updErr;

      supabase.functions
        .invoke("notify-it-ticket", { body: { ticket_id: ticket.id } })
        .catch((e) => console.warn("notify-it-ticket failed", e));

      const { data: mailData, error: mailErr } = await supabase.functions.invoke(
        "notify-onboarding-process",
        { body: { process_id: processId, document_path: built.path, requested_by: user?.email ?? null } }
      );

      return { built, ticketId: ticket.id, mailData, mailErr };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
      qc.invalidateQueries({ queryKey: ["it-tickets"] });
      qc.invalidateQueries({ queryKey: ["employee-documents"] });
    },
  });
}

/** Produce the "version 2 — after execution" protocol and close the ticket. */
export function useCompleteOnboardingProcess() {
  const qc = useQueryClient();
  const { activeCompanyId, activeCompany } = useCompany();

  return useMutation({
    mutationFn: async ({ processId }: { processId: string }) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");

      await appendOnboardingAudit(processId, "התהליך הושלם והופקה גרסה 2 של הפרוטוקול (לאחר ביצוע)");

      const built = await generateProtocol({
        processId,
        version: 2,
        companyId: activeCompanyId,
        companyName: activeCompany?.name ?? "",
        companyLogoUrl: (activeCompany as any)?.logo_url ?? null,
      });

      const { data: proc } = await supabase
        .from("onboarding_processes")
        .select("it_ticket_id")
        .eq("id", processId)
        .maybeSingle();

      await supabase
        .from("onboarding_processes")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          protocol_version: 2,
          pdf_url: built.path,
        } as any)
        .eq("id", processId);

      const ticketId = (proc as any)?.it_ticket_id;
      if (ticketId) {
        await supabase
          .from("it_tickets")
          .update({ status: "done" as any, resolved_at: new Date().toISOString() })
          .eq("id", ticketId);
      }

      await supabase.functions
        .invoke("notify-onboarding-process", {
          body: { process_id: processId, document_path: built.path, final: true },
        })
        .catch((e) => console.warn("notify-onboarding-process (final) failed", e));

      return built;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-processes"] });
      qc.invalidateQueries({ queryKey: ["it-tickets"] });
      qc.invalidateQueries({ queryKey: ["employee-documents"] });
    },
  });
}
