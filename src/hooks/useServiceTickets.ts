import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import {
  SlaSettingRow,
  generateTicketCode,
  resolveSlaHours,
  slaDeadlineFrom,
  subjectTicketType,
} from "@/lib/serviceTickets";

/** SLA settings for the active company */
export function useSlaSettings() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["sla-settings", activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_settings")
        .select("*")
        .eq("company_id", activeCompanyId!);
      if (error) throw error;
      return (data ?? []) as SlaSettingRow[];
    },
  });
}

export function useSaveSlaSetting() {
  const { activeCompanyId } = useCompany();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row: SlaSettingRow) => {
      const { error } = await supabase.from("sla_settings").upsert(
        {
          company_id: activeCompanyId!,
          subject_category: row.subject_category,
          priority: row.priority,
          target_hours: row.target_hours,
          notify_on_breach: row.notify_on_breach,
        },
        { onConflict: "company_id,subject_category,priority" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sla-settings"] }),
  });
}

/** Assets currently assigned to a given employee (for linking to a ticket) */
export function useEmployeeAssetOptions(employeeId?: string | null) {
  return useQuery({
    queryKey: ["employee-asset-options", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, asset_name, asset_code, serial_number, license_plate, asset_categories(category_name)")
        .eq("current_owner_id", employeeId!)
        .order("asset_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tickets opened by the signed-in employee */
export function useMyServiceTickets(employeeId?: string | null) {
  return useQuery({
    queryKey: ["my-service-tickets", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("it_tickets")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface CreateServiceTicketInput {
  employeeId: string;
  subject: string;
  title: string;
  description: string;
  priority: string;
  location?: string;
  contactPhone?: string;
  relatedAssetId?: string | null;
  attachments?: { name: string; url: string }[];
}

export function useCreateServiceTicket() {
  const { activeCompanyId } = useCompany();
  const { data: slaSettings } = useSlaSettings();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateServiceTicketInput) => {
      const hours = resolveSlaHours(slaSettings, input.subject, input.priority);
      const { data, error } = await supabase
        .from("it_tickets")
        .insert({
          company_id: activeCompanyId,
          employee_id: input.employeeId,
          ticket_code: generateTicketCode(),
          title: input.title,
          description: input.description || null,
          subject_category: input.subject,
          ticket_type: subjectTicketType(input.subject) as any,
          priority: input.priority as any,
          status: "open" as any,
          location: input.location || null,
          contact_phone: input.contactPhone || null,
          related_asset_id: input.relatedAssetId || null,
          attachments: (input.attachments ?? []) as any,
          sla_deadline: slaDeadlineFrom(hours),
        })
        .select("id")
        .single();
      if (error) throw error;

      supabase.functions
        .invoke("notify-it-ticket", { body: { ticket_id: data.id } })
        .catch((err) => console.warn("notify-it-ticket failed", err));

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["my-service-tickets"] });
    },
  });
}

export function useUpdateTicketStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("it_tickets")
        .update({
          status: status as any,
          resolved_at: status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["my-service-tickets"] });
    },
  });
}

/** Upload ticket attachments; returns stored file references */
export async function uploadTicketAttachments(companyId: string, files: File[]) {
  const out: { name: string; url: string }[] = [];
  for (const f of files) {
    const path = `it-tickets/${companyId}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, f, { upsert: false });
    if (!error) {
      const { data } = supabase.storage.from("documents").getPublicUrl(path);
      out.push({ name: f.name, url: data.publicUrl });
    }
  }
  return out;
}
