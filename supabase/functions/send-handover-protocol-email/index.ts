// Sends the signed handover/return protocol to the receiving employee.
// The recipient is always resolved server-side from the employees table —
// the browser never supplies an email address.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmailLogged } from '../_shared/send-email-logged.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

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

  const employeeId = typeof body?.employeeId === 'string' ? body.employeeId : ''
  const idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : undefined
  const templateData =
    body?.templateData && typeof body.templateData === 'object' ? body.templateData : {}

  if (!employeeId) return json({ error: 'employeeId is required' }, 400)

  // The caller must be allowed to see this employee (RLS applies to userClient).
  const { data: visible } = await userClient
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .maybeSingle()
  if (!visible) return json({ error: 'Forbidden' }, 403)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: employee } = await admin
    .from('employees')
    .select('email, full_name')
    .eq('id', employeeId)
    .maybeSingle()

  if (!employee?.email) return json({ success: false, reason: 'no_email' })

  const result = await sendTemplateEmailLogged(admin, 'handover-protocol', employee.email, {
    templateData: { ...templateData, employeeName: templateData.employeeName || employee.full_name || '' },
    idempotencyKey,
  })

  if (!result.sent && result.error) return json({ error: 'Failed to send email' }, 500)
  return json({ success: result.sent, reason: result.reason ?? null })
})
