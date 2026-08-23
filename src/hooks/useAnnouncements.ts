import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";

export interface Announcement {
  id: string;
  company_id: string | null;
  title: string;
  content: string;
  published_at: string;
  expires_at: string | null;
  sender_name: string | null;
  sender_role: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AnnouncementInput {
  title: string;
  content: string;
  published_at: string;
  expires_at: string | null;
  sender_name: string | null;
  sender_role: string | null;
}

/** All announcements of the active company (management view) */
export function useCompanyAnnouncements() {
  const { activeCompanyId } = useCompany();
  return useQuery({
    queryKey: ["announcements", "manage", activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return [] as Announcement[];
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .eq("company_id", activeCompanyId)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Announcement[];
    },
    enabled: !!activeCompanyId,
  });
}

/** Default signature (name + role) for the current user */
export function useSignatureDefaults() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["announcement-signature", user?.id],
    queryFn: async () => {
      if (!user) return { name: "", role: "" };
      const { data: emp } = await supabase
        .from("employees")
        .select("full_name, role")
        .eq("linked_user_id", user.id)
        .maybeSingle();
      if (emp) return { name: emp.full_name ?? "", role: emp.role ?? "" };
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      return {
        name: prof?.display_name ?? user.email ?? "",
        role: "",
      };
    },
    enabled: !!user,
  });
}

export function useAnnouncementMutations() {
  const { activeCompanyId } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["announcements"] });

  const create = useMutation({
    mutationFn: async (input: AnnouncementInput) => {
      if (!activeCompanyId) throw new Error("לא נבחרה חברה");
      const { error } = await supabase.from("announcements").insert({
        ...input,
        company_id: activeCompanyId,
        created_by: user?.id ?? null,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: AnnouncementInput & { id: string }) => {
      const { error } = await supabase.from("announcements").update(input as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { create, update, remove };
}

export type AnnouncementStatus = "scheduled" | "active" | "expired";

export function announcementStatus(a: Pick<Announcement, "published_at" | "expires_at">): AnnouncementStatus {
  const now = Date.now();
  if (new Date(a.published_at).getTime() > now) return "scheduled";
  if (a.expires_at && new Date(a.expires_at).getTime() <= now) return "expired";
  return "active";
}
