import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface OffboardingParams {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  endDate: string;
  digitalAccess: Array<{ access_type: string; resource_path: string }>;
  assets: Array<{ asset_name: string; asset_code: string; category_name: string }>;
}

export function useStartOffboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: OffboardingParams) => {
      // 1. Update employee status to 'leaving' and set end_date
      const { error: empError } = await supabase
        .from("employees")
        .update({ status: "leaving", end_date: params.endDate })
        .eq("id", params.employeeId);
      if (empError) throw empError;

      // 2. Mark all digital access assets (DACC) as 'lost' for this employee (suspended access)
      // Find DACC category for this company first
      const { data: empRow } = await supabase
        .from("employees")
        .select("company_id")
        .eq("id", params.employeeId)
        .single();
      if (empRow?.company_id) {
        const { data: daccCat } = await supabase
          .from("asset_categories")
          .select("id")
          .eq("company_id", empRow.company_id)
          .eq("prefix", "DACC")
          .maybeSingle();
        if (daccCat?.id) {
          const { error: accessError } = await supabase
            .from("assets")
            .update({ status: "in_stock", current_owner_id: null })
            .eq("current_owner_id", params.employeeId)
            .eq("category_id", daccCat.id);
          if (accessError) throw accessError;
        }
      }

      // 3. Reuse an existing open offboarding ticket instead of creating a duplicate
      const { data: existing } = await supabase
        .from("it_tickets")
        .select("id, ticket_code")
        .eq("employee_id", params.employeeId)
        .eq("ticket_type", "offboarding")
        .neq("status", "done")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const newTicketCode = existing?.ticket_code ?? generateTicketCode();

      // 4. Build the disconnection + collection checklist
      const checklist = [
        ...params.digitalAccess.map((da) => ({
          label: `ניתוק ${da.access_type}: ${da.resource_path}`,
          done: false,
        })),
        ...params.assets.map((a) => ({
          label: `משיכת ציוד: ${a.asset_name} (${a.asset_code}) — ${a.category_name}`,
          done: false,
        })),
        { label: "השבתת חשבון Active Directory", done: false },
        { label: "ניתוק רישיונות ותוכנות בתשלום", done: false },
        { label: "החזרת רכב חברה / רכב ליסינג (אם קיים)", done: false },
        { label: "מחיקת נתונים אישיים מהמכשירים", done: false },
        { label: "ביטול כרטיס כניסה / מפתחות", done: false },
      ];

      // 5. Create or update the offboarding service ticket, due on the last working day
      const dueDate = new Date(`${params.endDate}T17:00:00`);
      const slaDeadline = (isNaN(dueDate.getTime()) ? new Date(Date.now() + 4 * 3600_000) : dueDate).toISOString();

      const ticketPayload = {
        ticket_code: newTicketCode,
        company_id: empRow?.company_id ?? null,
        title: `ניתוקים וסיום העסקה - ${params.employeeName}`,
        description: `תהליך עזיבה לעובד ${params.employeeName} (${params.employeeCode}). יום עבודה אחרון: ${params.endDate}. יש לנתק גישות, תוכנות ורישיונות ולמשוך את הציוד המשוייך.`,
        employee_id: params.employeeId,
        ticket_type: "offboarding" as const,
        subject_category: "offboarding",
        priority: "critical" as const,
        status: "open" as const,
        sla_deadline: slaDeadline,
        checklist,
      };

      let ticketId = existing?.id ?? null;
      if (existing?.id) {
        const { error: updErr } = await supabase.from("it_tickets").update(ticketPayload).eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { data: inserted, error: ticketError } = await supabase
          .from("it_tickets")
          .insert(ticketPayload)
          .select("id")
          .single();
        if (ticketError) throw ticketError;
        ticketId = inserted.id;
      }

      // 6. Log activity
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("activity_log").insert({
        employee_id: params.employeeId,
        action: `התנעת תהליך עזיבה - ${params.employeeName}`,
        details: `תאריך סיום: ${params.endDate}. נוצרה קריאת שירות ${newTicketCode}.`,
        entity_type: "employee",
        entity_id: params.employeeId,
        performed_by: user?.id,
      });

      // 7. Create alert
      await supabase.from("alerts").insert({
        title: `עובד בתהליך עזיבה: ${params.employeeName}`,
        category: "עובדים",
        severity: "critical",
        target_date: params.endDate,
        related_employee_id: params.employeeId,
      });

      // 8. Notify operations
      if (ticketId) {
        supabase.functions
          .invoke("notify-it-ticket", { body: { ticket_id: ticketId } })
          .catch((err) => console.warn("notify-it-ticket failed", err));
      }

      return { ticketCode: newTicketCode };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-assets"] });
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}

/**
 * Cancels an active offboarding protocol when an employee returns to 'active'.
 * All the reversal work happens server-side in the cancel_offboarding function.
 */
export function useCancelOffboarding() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await supabase.rpc("cancel_offboarding" as any, {
        _employee_id: employeeId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      for (const key of [
        "employee", "employees", "offboarding", "offboarding-process",
        "offboarding-items", "offboarding-forms", "it-tickets",
        "activity-log", "alerts", "dashboard-stats",
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}
