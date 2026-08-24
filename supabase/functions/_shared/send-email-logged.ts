// Managed send helpers with app-side logging into email_send_log.
//
// Delivery, retries, rate limits, suppression and unsubscribe are handled by
// Lovable's managed email API. These helpers only add the project's own
// bookkeeping rows (sent / suppressed / failed).

import { EmailAPIError, sendLovableEmail } from 'npm:@lovable.dev/email-js@0.1.0'
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts'

export const SITE_NAME = 'תפעול 360'
export const SENDER_DOMAIN = 'notify.tiful360.com'
export const FROM_DOMAIN = 'tiful360.com'

export function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

async function logSend(
  supabase: any,
  row: {
    message_id?: string | null
    template_name: string
    recipient_email: string
    status: 'sent' | 'suppressed' | 'failed'
    error_message?: string | null
    metadata?: Record<string, unknown> | null
  },
) {
  const { error } = await supabase.from('email_send_log').insert({
    message_id: row.message_id ?? null,
    template_name: row.template_name,
    recipient_email: row.recipient_email,
    status: row.status,
    error_message: row.error_message ?? null,
    metadata: row.metadata ?? null,
  })
  if (error) console.error('email_send_log insert failed', { status: row.status, error })
}

/** Send a registered React Email template and record the outcome. */
export async function sendTemplateEmailLogged(
  supabase: any,
  templateName: string,
  to: string,
  options: {
    templateData?: Record<string, unknown>
    idempotencyKey?: string
    metadata?: Record<string, unknown>
  } = {},
): Promise<{ sent: boolean; reason?: string; error?: string }> {
  try {
    const result = await sendTemplateEmail(templateName, to, {
      templateData: options.templateData ?? {},
      idempotencyKey: options.idempotencyKey,
    })
    if (!result.sent) {
      await logSend(supabase, {
        message_id: options.idempotencyKey ?? null,
        template_name: templateName,
        recipient_email: to,
        status: 'suppressed',
        metadata: options.metadata ?? null,
      })
      return { sent: false, reason: result.reason }
    }
    await logSend(supabase, {
      message_id: options.idempotencyKey ?? null,
      template_name: templateName,
      recipient_email: to,
      status: 'sent',
      metadata: options.metadata ?? null,
    })
    return { sent: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('send failed', { templateName, error: message })
    await logSend(supabase, {
      message_id: options.idempotencyKey ?? null,
      template_name: templateName,
      recipient_email: to,
      status: 'failed',
      error_message: message.slice(0, 1000),
      metadata: options.metadata ?? null,
    })
    return { sent: false, error: message }
  }
}

export interface SendHtmlArgs {
  to: string
  subject: string
  html: string
  label: string
  idempotencyKey?: string
  metadata?: Record<string, unknown>
  replyTo?: string
}

/** Send a hand-composed HTML email and record the outcome. */
export async function sendHtmlEmailLogged(
  supabase: any,
  { to, subject, html, label, idempotencyKey, metadata, replyTo }: SendHtmlArgs,
): Promise<boolean> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  if (!apiKey) {
    console.error('LOVABLE_API_KEY is not configured')
    await logSend(supabase, {
      message_id: idempotencyKey ?? null,
      template_name: label,
      recipient_email: to,
      status: 'failed',
      error_message: 'LOVABLE_API_KEY is not configured',
      metadata: metadata ?? null,
    })
    return false
  }

  try {
    await sendLovableEmail(
      {
        to,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text: htmlToText(html) || subject,
        purpose: 'transactional',
        label,
        idempotency_key: idempotencyKey || crypto.randomUUID(),
        reply_to: replyTo,
      },
      { apiKey, sendUrl: Deno.env.get('LOVABLE_SEND_URL') },
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      await logSend(supabase, {
        message_id: idempotencyKey ?? null,
        template_name: label,
        recipient_email: to,
        status: 'suppressed',
        metadata: metadata ?? null,
      })
      return false
    }
    const message = error instanceof Error ? error.message : String(error)
    console.error('send failed', { label, error: message })
    await logSend(supabase, {
      message_id: idempotencyKey ?? null,
      template_name: label,
      recipient_email: to,
      status: 'failed',
      error_message: message.slice(0, 1000),
      metadata: metadata ?? null,
    })
    return false
  }

  await logSend(supabase, {
    message_id: idempotencyKey ?? null,
    template_name: label,
    recipient_email: to,
    status: 'sent',
    metadata: metadata ?? null,
  })
  return true
}
