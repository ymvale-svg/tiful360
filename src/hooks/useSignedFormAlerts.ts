import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

/**
 * Live popup for the person who sent a form to signature: as soon as the
 * employee signs, a toast appears in the app.
 */
export function useSignedFormAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`signed-forms-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "asset_handover_forms",
          filter: `created_by=eq.${user.id}`,
        },
        (payload) => {
          const next = payload.new as any;
          const prev = payload.old as any;
          if (next?.status !== "signed" || prev?.status === "signed") return;

          const snap = (next.form_snapshot ?? {}) as any;
          const employeeName = snap.employee_name || "העובד";
          const itemName = snap.asset_name || snap.title || "הטופס";
          const action = next.direction === "return" ? "הזדכות" : "מסירה";

          toast({
            title: "הטופס נחתם ✓",
            description: `${employeeName} חתם/ה על טופס ${action} · ${itemName}`,
          });

          queryClient.invalidateQueries({ queryKey: ["handover-forms"] });
          queryClient.invalidateQueries({ queryKey: ["pending-handover-forms"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);
}
