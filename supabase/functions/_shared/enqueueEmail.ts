// Shared helper for the project's hand-composed notification emails.
// Sends synchronously through Lovable's managed email API (no queue) and
// records the outcome in email_send_log.

import { sendHtmlEmailLogged, htmlToText, SENDER_DOMAIN, FROM_DOMAIN, SITE_NAME } from "./send-email-logged.ts";

export { htmlToText, SENDER_DOMAIN, FROM_DOMAIN, SITE_NAME };

export interface EnqueueArgs {
  to: string;
  subject: string;
  html: string;
  label: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export async function enqueueTransactionalEmail(
  supabase: any,
  { to, subject, html, label, idempotencyKey, metadata }: EnqueueArgs,
): Promise<boolean> {
  return await sendHtmlEmailLogged(supabase, {
    to,
    subject,
    html,
    label,
    idempotencyKey,
    metadata,
  });
}
