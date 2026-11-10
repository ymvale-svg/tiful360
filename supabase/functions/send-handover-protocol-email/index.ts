// Sends the signed handover/return protocol to the receiving employee.
// The recipient is always resolved server-side from the employees table —
// the browser never supplies an email address.
//
// The PDF link, the portal link and the company branding are also resolved
// server-side: the caller sends a formId (asset_handover_forms) and the PDF
// path is read from that row, which must belong to employeeId and live under
// the form's company folder. pdfUrl / portalUrl / companyLogoUrl / companyName
// from the browser are ignored.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { sendTemplateEmailLogged } from '../_shared/send-email-logged.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://tiful360.com').replace(/\/+$/, '')
const PORTAL_URL = `${SITE_URL}/portal`

// The emailed PDF link is a signed URL into the private bucket; keep it short.
// The protocol stays available in the portal, where it is signed on click.
const PDF_LINK_TTL_SECONDS = 60 * 60 * 24 * 7

// Fields the browser must not control: links and branding.
const SERVER_ONLY_FIELDS = ['pdfUrl', 'portalUrl', 'companyLogoUrl', 'companyName', 'companyId']

/** Storage object path from a stored pdf_url (bare path or legacy full URL). */
function handoverObjectPath(value: string): string | null {
  const marker = '/handover-forms/'
  const idx = value.indexOf(marker)
  const raw = (idx >= 0 ? value.slice(idx + marker.length) : value).split('?')[0].split('#')[0]
  let path: string
  try {
    path = decodeURIComponent(raw).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (!path || path.includes('\\')) return null
  if (path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) return null
  return path
}

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
  const formId = typeof body?.formId === 'string' ? body.formId : ''
  const idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : undefined
  const templateData: Record<string, unknown> =
    body?.templateData && typeof body.templateData === 'object' ? { ...body.templateData } : {}
  for (const key of SERVER_ONLY_FIELDS) delete templateData[key]

  if (!employeeId) return json({ error: 'employeeId is required' }, 400)
  if (!formId) return json({ error: 'formId is required' }, 400)

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

  // The form must be this employee's; its PDF path comes from the row, never the browser.
  const { data: form } = await admin
    .from('asset_handover_forms')
    .select('id, employee_id, company_id, asset_id, pdf_url')
    .eq('id', formId)
    .maybeSingle()
  if (!form || form.employee_id !== employeeId) return json({ error: 'Forbidden' }, 403)

  if (!employee?.email) return json({ success: false, reason: 'no_email' })

  // Only files under the form's own folders: <company>/<employee>/ (pending-form
  // signing), <company>/<asset>/ (single handover) or <company>/multi/ (multi handover).
  let pdfUrl: string | null = null
  const path = typeof form.pdf_url === 'string' && form.pdf_url ? handoverObjectPath(form.pdf_url) : null
  const allowedPrefixes = [
    `${form.company_id}/${form.employee_id}/`,
    ...(form.asset_id ? [`${form.company_id}/${form.asset_id}/`] : []),
    `${form.company_id}/multi/`,
  ]
  if (path && form.company_id && allowedPrefixes.some((p) => path.startsWith(p))) {
    const { data: signed, error: signErr } = await admin.storage
      .from('handover-forms')
      .createSignedUrl(path, PDF_LINK_TTL_SECONDS)
    pdfUrl = signErr ? null : signed?.signedUrl ?? null
  } else if (form.pdf_url) {
    console.warn('handover protocol email: pdf path rejected', { formId })
  }

  // Branding from the companies table, for the form's company.
  const { data: company } = await admin
    .from('companies')
    .select('name, logo_url')
    .eq('id', form.company_id)
    .maybeSingle()

  const result = await sendTemplateEmailLogged(admin, 'handover-protocol', employee.email, {
    templateData: {
      ...templateData,
      companyName: company?.name ?? '',
      companyLogoUrl: company?.logo_url || undefined,
      pdfUrl,
      portalUrl: PORTAL_URL,
      employeeName: templateData.employeeName || employee.full_name || '',
    },
    idempotencyKey,
    metadata: { employee_id: employeeId, company_id: form.company_id, form_id: formId },
  })

  if (!result.sent && result.error) return json({ error: 'Failed to send email' }, 500)
  return json({ success: result.sent, reason: result.reason ?? null })
})
