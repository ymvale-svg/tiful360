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

      // 2. Suspend all digital access
      const { error: accessError } = await supabase
        .from("digital_access")
        .update({ status: "suspended" })
        .eq("employee_id", params.employeeId)
        .eq("status", "active");
      if (accessError) throw accessError;

      // 3. Generate ticket code
      const { data: lastTicket } = await supabase
        .from("it_tickets")
        .select("ticket_code")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const lastNum = lastTicket?.ticket_code
        ? parseInt(lastTicket.ticket_code.replace("IT-", ""), 10)
        : 0;
      const newTicketCode = `IT-${String(lastNum + 1).padStart(3, "0")}`;

      // 4. Build checklist from digital access
      const checklist = [
        ...params.digitalAccess.map((da) => ({
          label: `ניתוק ${da.access_type}: ${da.resource_path}`,
          done: false,
        })),
        { label: "השבתת חשבון Active Directory", done: false },
        { label: "איסוף כל הציוד הפיזי", done: false },
        { label: "מחיקת נתונים אישיים מהמכשירים", done: false },
        { label: "ביטול כרטיס כניסה / מפתחות", done: false },
      ];

      // 5. Create IT ticket
      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + 4);

      const { error: ticketError } = await supabase.from("it_tickets").insert({
        ticket_code: newTicketCode,
        title: `פרוטוקול ניתוק - ${params.employeeName}`,
        employee_id: params.employeeId,
        ticket_type: "offboarding",
        priority: "critical",
        status: "open",
        sla_deadline: slaDeadline.toISOString(),
        checklist,
      });
      if (ticketError) throw ticketError;

      // 6. Log activity
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("activity_log").insert({
        employee_id: params.employeeId,
        action: `התנעת תהליך עזיבה - ${params.employeeName}`,
        details: `תאריך סיום: ${params.endDate}. נוצרה קריאת IT ${newTicketCode}.`,
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

      return { ticketCode: newTicketCode };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee-digital-access"] });
      queryClient.invalidateQueries({ queryKey: ["it-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });
}
