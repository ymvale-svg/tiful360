import { supabase } from "@/integrations/supabase/client";

/**
 * Public remote-signing link for a handover/return protocol.
 * Uses the live origin so preview links stay inside the preview host.
 */
export function signLinkFor(token: string): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://tiful360.com";
  return `${origin}/handover/${token}`;
}

/**
 * Ask the backend to email the employee a direct signing link.
 * Falls back to the locally built links when the mail cannot be sent, so the
 * sender can always share the link themselves.
 */
export async function sendSignLink(
  formIds: string[],
  fallbackLinks: string[],
): Promise<{ links: string[]; sent: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-handover-sign-link", {
      body: { formIds },
    });
    if (error) return { links: fallbackLinks, sent: false };
    const links = Array.isArray(data?.links) && data.links.length ? data.links : fallbackLinks;
    return { links, sent: Boolean(data?.success) };
  } catch {
    return { links: fallbackLinks, sent: false };
  }
}
