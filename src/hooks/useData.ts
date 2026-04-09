import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEmployees() {
  return useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useEmployeeAssets(employeeId: string) {
  return useQuery({
    queryKey: ["employee-assets", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, asset_categories(category_name, prefix, icon)")
        .eq("current_owner_id", employeeId);
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}

export function useEmployeeDigitalAccess(employeeId: string) {
  return useQuery({
    queryKey: ["employee-digital-access", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("digital_access")
        .select("*")
        .eq("employee_id", employeeId);
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
  });
}

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, asset_categories(category_name, prefix, icon), employees!assets_current_owner_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAssetCategories() {
  return useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_categories")
        .select("*, assets(count)")
        .order("category_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useITTickets() {
  return useQuery({
    queryKey: ["it-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("it_tickets")
        .select("*, employees(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("is_resolved", false)
        .order("severity")
        .order("target_date");
      if (error) throw error;
      return data;
    },
  });
}

export function useActivityLog(employeeId?: string) {
  return useQuery({
    queryKey: ["activity-log", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useKnowledgeBase() {
  return useQuery({
    queryKey: ["knowledge-base"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .order("title");
      if (error) throw error;
      return data;
    },
  });
}

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [employees, assets, alerts, tickets] = await Promise.all([
        supabase.from("employees").select("status", { count: "exact" }),
        supabase.from("assets").select("status", { count: "exact" }),
        supabase.from("alerts").select("id", { count: "exact" }).eq("is_resolved", false),
        supabase.from("it_tickets").select("id", { count: "exact" }).neq("status", "done"),
      ]);
      return {
        activeEmployees: employees.count ?? 0,
        totalAssets: assets.count ?? 0,
        openAlerts: alerts.count ?? 0,
        openTickets: tickets.count ?? 0,
      };
    },
  });
}
