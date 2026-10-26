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
      // The transaction validates the caller, tenant and actor before any writes.
      const { data, error } = await supabase.rpc("start_employee_offboarding", {
        _employee_id: params.employeeId,
        _end_date: params.endDate,
      });
      if (error) throw error;
      const result = data as { ticketCode?: string; ticketId?: string } | null;
      if (!result?.ticketCode || !result.ticketId) {
        throw new Error("לא התקבל אישור להפעלת תהליך העזיבה");
      }
      // Notification failure must not misrepresent the committed transaction.
      void supabase.functions.invoke("notify-it-ticket", {
        body: { ticket_id: result.ticketId },
      }).then(({ error }) => {
        if (error) console.warn("notify-it-ticket failed", error);
      }).catch((error) => console.warn("notify-it-ticket failed", error));
      return { ticketCode: result.ticketCode };
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

      // Close any open offboarding ticket for this employee
      await supabase
        .from("it_tickets")
        .update({ status: "done", resolved_at: new Date().toISOString() })
        .eq("employee_id", employeeId)
        .eq("ticket_type", "offboarding")
        .neq("status", "done");
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
