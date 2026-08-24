// Shared helper for enqueuing transactional emails into the pgmq queue with
// the exact payload shape that process-email-queue / sendLovableEmail expect.
// Missing fields (message_id, from, sender_domain, text) previously caused
// emails to silently never be sent or logged.

export const SENDER_DOMAIN = "notify.tiful360.com";
export const FROM_DOMAIN = "tiful360.com";
export const SITE_NAME = "תפעול 360";

export function htmlToText(html: string): string {
  return String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const messageId = idempotencyKey ?? crypto.randomUUID();

  const { error } = await supabase.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to,
      from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text: htmlToText(html) || subject,
      purpose: "transactional",
      label,
      idempotency_key: messageId,
      queued_at: new Date().toISOString(),
      metadata: metadata ?? {},
    },
  });

  if (error) {
    console.error("enqueue_email failed", { to, label, error });
    return false;
  }

  const { error: logError } = await supabase.from("email_send_log").insert({
    message_id: messageId,
    template_name: label,
    recipient_email: to,
    status: "pending",
    metadata: metadata ?? {},
  });
  if (logError) console.error("email_send_log insert failed", logError);

  return true;
}
