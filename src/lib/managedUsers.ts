import { supabase } from "@/integrations/supabase/client";

export interface ManagedUser {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  banned_until: string | null;
  /** Roles in the requested company (group roles + platform/portal roles). */
  roles: string[];
  /** Permission groups of the requested company the user belongs to. */
  groups?: { id: string; name: string }[];
}

/** Users of one company, listed by the manage-users function (service role, caller-checked). */
export async function fetchManagedUsers(companyId: string | null): Promise<ManagedUser[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const params = new URLSearchParams({ action: "list" });
  if (companyId) params.set("company_id", companyId);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    }
  );
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to fetch users");
  }
  return res.json();
}
