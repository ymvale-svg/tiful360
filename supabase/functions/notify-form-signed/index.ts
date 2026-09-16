// Notifies the person who sent a handover/return form that the employee signed it.
// Called by the signing screen right after a successful signature.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmailLogged } from '../_shared/send-email-logged.ts'
import { fmtDateTimeIL } from '../_shared/formatDate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const APP_ORIGIN = 'https://tiful360.com'

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''))
  if (!claims?.claims) return json({ error: 'Unauthorized' }, 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const token = typeof body?.token === 'string' ? body.token : null
  if (!token) return json({ error: 'token is required' }, 400)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: form, error } = await admin
    .from('asset_handover_forms')
    .select('id, asset_id, employee_id, direction, status, signed_at, created_by, form_snapshot')
    .eq('sign_token', token)
    .maybeSingle()

  if (error) return json({ error: 'Lookup failed' }, 500)
  if (!form) return json({ error: 'Invalid token' }, 404)
  if (form.status !== 'signed') return json({ success: false, reason: 'not_signed' })
  if (!form.created_by) return json({ success: false, reason: 'no_sender' })

  const { data: sender } = await admin.auth.admin.getUserById(form.created_by)
  const senderEmail = sender?.user?.email
  if (!senderEmail) return json({ success: false, reason: 'no_sender_email' })

  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('user_id', form.created_by)
    .maybeSingle()

  const { data: employee } = await admin
    .from('employees')
    .select('full_name')
    .eq('id', form.employee_id)
    .maybeSingle()

  const snap: any = form.form_snapshot ?? {}
  const fv = (key: string) =>
    (Array.isArray(snap.fields) ? snap.fields.find((x: any) => x?.key === key)?.value : null) ?? null

  const items = [{
    name: String(snap.asset_name ?? fv('asset_name') ?? snap.title ?? ''),
    code: String(snap.asset_code ?? fv('asset_code') ?? ''),
  }].filter((i) => i.name)

  const result = await sendTemplateEmailLogged(admin, 'handover-signed-notice', senderEmail, {
    templateData: {
      recipientName: profile?.display_name ?? '',
      employeeName: employee?.full_name ?? snap.employee_name ?? '',
      title: snap.title ?? null,
      direction: form.direction ?? 'handover',
      signedAt: fmtDateTimeIL(form.signed_at ?? new Date()),
      items,
      formUrl: `${APP_ORIGIN}/employees/${form.employee_id}`,
    },
    idempotencyKey: `handover-signed-${form.id}`,
  })

  if (!result.sent && result.error) return json({ error: 'Failed to send email' }, 500)
  return json({ success: result.sent, reason: result.reason ?? null })
})
