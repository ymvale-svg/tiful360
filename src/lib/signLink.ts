import { supabase } from "@/integrations/supabase/client";

/** Official public site origin — links shared with employees never expose internal hosts. */
export const APP_ORIGIN = "https://tiful360.com";

/**
 * Public remote-signing link for a handover/return protocol.
 * Always built on the official domain so the link is shareable and professional.
 */
export function signLinkFor(tokenOrCode: string | null | undefined, shortCode?: string | null): string {
  const code = shortCode ?? null;
  // Short 6-char code keeps the shared link tidy; the long token stays as fallback.
  if (code) return `${APP_ORIGIN}/h/${code}`;
  return `${APP_ORIGIN}/handover/${tokenOrCode ?? ""}`;
}

/**
 * Ask the backend to email the employee a direct signing link.
 * Falls back to the locally built links when the mail cannot be sent, so the
 * sender can always share the link themselves.
 */
export async function sendSignLink(
  formIds: string[],
  fallbackLinks: string[],
  opts: { resend?: boolean } = {},
): Promise<{ links: string[]; sent: boolean; reason: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-handover-sign-link", {
      body: { formIds, resend: Boolean(opts.resend) },
    });
    if (error) return { links: fallbackLinks, sent: false, reason: "send_failed" };
    const links = Array.isArray(data?.links) && data.links.length ? data.links : fallbackLinks;
    return { links, sent: Boolean(data?.success), reason: data?.reason ?? null };
  } catch {
    return { links: fallbackLinks, sent: false, reason: "send_failed" };
  }
}

/** Human-readable Hebrew explanation for a failed sign-link email. */
export function describeSignEmailReason(reason: string | null | undefined): string {
  switch (reason) {
    case "no_email":
      return "לעובד אין כתובת מייל בכרטיס העובד — הוסיפו כתובת ונסו שוב";
    case "recipient_suppressed":
      return "כתובת המייל של העובד חסומה לשליחה (החזרות או ביטול הרשמה)";
    default:
      return "שליחת המייל נכשלה — נסו שוב מאוחר יותר";
  }
}
