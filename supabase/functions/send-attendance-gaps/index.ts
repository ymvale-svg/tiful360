import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const APP_URL = 'https://tiful360.com'

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatDateIL(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Verify caller and check role
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { company_id, from, to, employee_ids } = body ?? {}
  if (!company_id || !from || !to) {
    return new Response(JSON.stringify({ error: 'company_id, from, to are required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Check user role via service client
  const admin = createClient(supabaseUrl, serviceKey)
  const { data: roleRows } = await admin
    .from('user_roles').select('role').eq('user_id', user.id)
  const roles = (roleRows ?? []).map((r: any) => r.role)
  const { data: accessRows } = await admin
    .from('user_company_access').select('company_id,role').eq('user_id', user.id).eq('company_id', company_id)
  const hasAccess = (accessRows ?? []).length > 0
  const isAuthorized =
    roles.includes('super_admin') ||
    (hasAccess && (roles.includes('admin') || roles.includes('payroll')))
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fetch gaps via RPC (impersonating user so RLS/security definer check passes)
  const { data: gaps, error: rpcErr } = await userClient.rpc('get_attendance_gaps', {
    _company_id: company_id, _from: from, _to: to,
  })
  if (rpcErr) {
    return new Response(JSON.stringify({ error: rpcErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Group by employee
  const byEmp = new Map<string, { full_name: string; email: string | null; rows: any[] }>()
  for (const g of gaps ?? []) {
    if (employee_ids?.length && !employee_ids.includes(g.employee_id)) continue
    const cur = byEmp.get(g.employee_id) ?? { full_name: g.full_name, email: g.email, rows: [] }
    cur.rows.push(g)
    byEmp.set(g.employee_id, cur)
  }

  // Company name for email
  const { data: company } = await admin.from('companies').select('name').eq('id', company_id).single()

  let queued = 0
  let skipped_no_email = 0
  const errors: string[] = []

  for (const [empId, info] of byEmp.entries()) {
    if (!info.email) { skipped_no_email++; continue }

    const firstGap = info.rows[0]?.gap_date as string
    const correctionUrl = `${APP_URL}/portal?tab=attendance&correction=open&date=${firstGap}`

    const templateData = {
      employeeName: info.full_name,
      companyName: company?.name ?? '',
      fromDate: formatDateIL(from),
      toDate: formatDateIL(to),
      correctionUrl,
      gaps: info.rows.map((r: any) => ({
        date: formatDateIL(r.gap_date),
        weekday: WEEKDAYS[new Date(r.gap_date).getDay()],
        type: r.gap_type,
        punches: r.punch_times ?? '',
      })),
    }

    const idempotencyKey = `attendance-gaps-${empId}-${from}-${to}`

    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: 'attendance-gaps',
        recipientEmail: info.email,
        idempotencyKey,
        templateData,
      }),
    })
    if (resp.ok) {
      queued++
    } else {
      const errText = await resp.text().catch(() => '')
      errors.push(`${info.email}: ${resp.status} ${errText}`)
    }
  }

  return new Response(JSON.stringify({
    queued, skipped_no_email, total_employees: byEmp.size, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
