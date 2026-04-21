import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export function useEmployees() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["employees", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("employees_public").select("*").order("full_name");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
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
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["assets", activeCompanyId],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select("*, asset_categories(category_name, prefix, icon), employees!assets_current_owner_id_fkey(full_name)")
        .order("created_at", { ascending: false });
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAssetCategories() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["asset-categories", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("asset_categories").select("*, assets(count)").order("category_name");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useITTickets() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["it-tickets", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("it_tickets").select("*, employees(full_name)").order("created_at", { ascending: false });
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAlerts() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["alerts", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("alerts").select("*").eq("is_resolved", false).order("severity").order("target_date");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useActivityLog(employeeId?: string) {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["activity-log", activeCompanyId, employeeId],
    queryFn: async () => {
      let query = supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(50);
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      if (employeeId) query = query.eq("employee_id", employeeId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAnnouncements() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["announcements", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("announcements").select("*").order("published_at", { ascending: false });
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useKnowledgeBase() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["knowledge-base", activeCompanyId],
    queryFn: async () => {
      let query = supabase.from("knowledge_base").select("*").order("title");
      if (activeCompanyId) query = query.eq("company_id", activeCompanyId);
      const { data, error } = await query;
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

export interface CompanyContact {
  id: string;
  name: string;
  role: string;
  department: string;
  phone: string | null;
  email: string | null;
  sort_order: number | null;
  source: "employee" | "external";
}

export function useCompanyContacts() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["company-contacts-merged", activeCompanyId],
    queryFn: async (): Promise<CompanyContact[]> => {
      if (!activeCompanyId) return [];
      const [empRes, extRes] = await Promise.all([
        supabase.rpc("get_company_contacts", { _company_id: activeCompanyId }),
        supabase.from("portal_contacts").select("*").eq("company_id", activeCompanyId),
      ]);
      if (empRes.error) throw empRes.error;
      if (extRes.error) throw extRes.error;

      const employees: CompanyContact[] = (empRes.data ?? []).map((e: any) => ({
        id: `emp-${e.id}`,
        name: e.full_name,
        role: e.role ?? "",
        department: e.department ?? "",
        phone: e.phone ?? null,
        email: e.email ?? null,
        sort_order: e.contact_sort_order,
        source: "employee" as const,
      }));
      const external: CompanyContact[] = (extRes.data ?? []).map((c: any) => ({
        id: `ext-${c.id}`,
        name: c.name,
        role: c.role,
        department: c.department,
        phone: c.phone,
        email: c.email ?? null,
        sort_order: c.sort_order,
        source: "external" as const,
      }));

      const merged = [...employees, ...external];
      merged.sort((a, b) => {
        const sa = a.sort_order ?? Number.MAX_SAFE_INTEGER;
        const sb = b.sort_order ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        const da = (a.department || "").localeCompare(b.department || "", "he");
        if (da !== 0) return da;
        return (a.name || "").localeCompare(b.name || "", "he");
      });
      return merged;
    },
    enabled: !!activeCompanyId,
  });
}

export function useDashboardStats() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["dashboard-stats", activeCompanyId],
    queryFn: async () => {
      let empQ = supabase.from("employees").select("status", { count: "exact" });
      let assetQ = supabase.from("assets").select("status", { count: "exact" });
      let alertQ = supabase.from("alerts").select("id", { count: "exact" }).eq("is_resolved", false);
      let ticketQ = supabase.from("it_tickets").select("id", { count: "exact" }).neq("status", "done");

      if (activeCompanyId) {
        empQ = empQ.eq("company_id", activeCompanyId);
        assetQ = assetQ.eq("company_id", activeCompanyId);
        alertQ = alertQ.eq("company_id", activeCompanyId);
        ticketQ = ticketQ.eq("company_id", activeCompanyId);
      }

      const [employees, assets, alerts, tickets] = await Promise.all([empQ, assetQ, alertQ, ticketQ]);
      return {
        activeEmployees: employees.count ?? 0,
        totalAssets: assets.count ?? 0,
        openAlerts: alerts.count ?? 0,
        openTickets: tickets.count ?? 0,
      };
    },
  });
}
