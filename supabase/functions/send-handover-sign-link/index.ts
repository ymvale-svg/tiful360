// Emails the employee a direct link to sign a pending handover/return protocol.
// The recipient and the sign tokens are resolved server-side; the browser only
// supplies the form ids it is already allowed to see.
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

  const formIds: string[] = Array.isArray(body?.formIds)
    ? body.formIds.filter((v: unknown) => typeof v === 'string').slice(0, 50)
    : []
  if (formIds.length === 0) return json({ error: 'formIds is required' }, 400)

  // RLS applies here: the caller must be allowed to see these forms.
  const { data: forms, error } = await userClient
    .from('asset_handover_forms')
    .select('id, employee_id, sign_token, short_code, direction, status, form_snapshot')
    .in('id', formIds)
  if (error) return json({ error: 'Lookup failed' }, 500)
  if (!forms?.length) return json({ error: 'Forbidden' }, 403)

  const employeeId = forms[0].employee_id
  if (forms.some((f: any) => f.employee_id !== employeeId)) {
    return json({ error: 'Forms must belong to one employee' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: employee } = await admin
    .from('employees')
    .select('email, full_name')
    .eq('id', employeeId)
    .maybeSingle()

  const links = forms.map((f: any) => f.short_code ? `${APP_ORIGIN}/h/${f.short_code}` : `${APP_ORIGIN}/handover/${f.sign_token}`)
  if (!employee?.email) return json({ success: false, reason: 'no_email', links })

  const snap: any = forms[0].form_snapshot ?? {}

  const items = forms.map((f: any) => {
    const s: any = f.form_snapshot ?? {}
    const fv = (key: string) =>
      (Array.isArray(s.fields) ? s.fields.find((x: any) => x?.key === key)?.value : null) ?? null
    return {
      name: String(s.asset_name ?? fv('asset_name') ?? s.title ?? ''),
      code: String(s.asset_code ?? fv('asset_code') ?? ''),
    }
  })

  const result = await sendTemplateEmailLogged(admin, 'handover-sign-request', employee.email, {
    templateData: {
      employeeName: employee.full_name ?? snap.employee_name ?? '',
      companyName: snap.company_name ?? '',
      title: snap.title ?? null,
      direction: forms[0].direction ?? 'handover',
      issuerName: snap.issuer_name ?? '',
      issuedAt: fmtDateTimeIL(new Date()),
      items,
      signUrl: links[0],
    },
    idempotencyKey: `handover-sign-${forms.map((f: any) => f.id).sort().join('-')}`,
  })

  if (!result.sent && result.error) return json({ error: 'Failed to send email', links }, 500)
  return json({ success: result.sent, reason: result.reason ?? null, links })
})
