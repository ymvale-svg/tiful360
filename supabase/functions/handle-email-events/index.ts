import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// Notification-only bookkeeping: Lovable enforces suppression at send time.
// These rows keep the project's own history tables up to date.
async function recordOutcome(
  event: any,
  reason: 'bounce' | 'complaint' | 'unsubscribe',
  logStatus: 'bounced' | 'complained' | 'suppressed',
  logMessage: string,
) {
  const email = String(event?.data?.recipient ?? '').toLowerCase()
  if (!email) return

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      event_id: event.event_id,
      error: { code: suppressError.code, message: suppressError.message },
    })
    throw new Error('Failed to write suppression')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: 'system',
    recipient_email: email,
    status: logStatus,
    error_message: logMessage,
    metadata: null,
  })
  if (logError) {
    console.error('Failed to insert email_send_log', {
      event_id: event.event_id,
      error: { code: logError.code, message: logError.message },
    })
    throw new Error('Failed to write email log')
  }
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await recordOutcome(
        event,
        'bounce',
        'bounced',
        'Permanent bounce — email address is invalid or rejected',
      )
    },
    'email.complaint': async (event) => {
      await recordOutcome(
        event,
        'complaint',
        'complained',
        'Spam complaint — recipient marked email as spam',
      )
    },
    'email.unsubscribed': async (event) => {
      await recordOutcome(event, 'unsubscribe', 'suppressed', 'Recipient unsubscribed')
    },
  },
})

Deno.serve((req) => handler(req))
