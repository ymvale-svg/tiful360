// Daily HR report: list of employees who did not punch today and did not
// have an approved leave/sick request. Sent to HR / payroll users per company.
// Scheduled by pg_cron at 12:00 Asia/Jerusalem; also invokable on-demand from UI.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function todayIL(): string {
  const now = new Date()
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const y = il.getFullYear()
  const m = String(il.getMonth() + 1).padStart(2, '0')
  const d = String(il.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateIL(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let body: any = {}
  try { body = req.method === 'POST' ? await req.json() : {} } catch {}
  const target: string = body?.date || todayIL()
  const requestedCompany: string | undefined = body?.company_id

  // Fetch missing punches across companies
  const { data: rows, error } = await admin.rpc('get_daily_missing_punches', { _target_date: target })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Group by company
  const byCompany = new Map<string, { company_name: string; rows: any[] }>()
  for (const r of rows ?? []) {
    if (requestedCompany && r.company_id !== requestedCompany) continue
    const cur = byCompany.get(r.company_id) ?? { company_name: r.company_name, rows: [] }
    cur.rows.push(r)
    byCompany.set(r.company_id, cur)
  }

  // Ensure we also send "all clear" for requested company even if no gaps
  if (requestedCompany && !byCompany.has(requestedCompany)) {
    const { data: c } = await admin.from('companies').select('name').eq('id', requestedCompany).single()
    byCompany.set(requestedCompany, { company_name: c?.name ?? '', rows: [] })
  } else if (!requestedCompany) {
    // For cron: also include companies with active tracking employees but 0 gaps? Skip — no need to notify when nothing to report.
  }

  const reportDate = formatDateIL(target)
  let queued = 0
  let skipped_no_recipients = 0
  const errors: string[] = []

  for (const [companyId, info] of byCompany.entries()) {
    // Find HR recipients: users with role payroll/admin/super_admin who have access to this company.
    // super_admin has global access; others via user_company_access.
    const { data: accessRows } = await admin
      .from('user_company_access')
      .select('user_id, role')
      .eq('company_id', companyId)
      .in('role', ['payroll', 'admin'])

    const userIds = new Set<string>((accessRows ?? []).map((a: any) => a.user_id))

    // Also include super_admins (global)
    const { data: superAdmins } = await admin
      .from('user_roles').select('user_id').eq('role', 'super_admin')
    for (const s of superAdmins ?? []) userIds.add(s.user_id)

    if (userIds.size === 0) { skipped_no_recipients++; continue }

    // Verify each user actually has payroll or admin role (user_roles) — filter
    const { data: userRoleRows } = await admin
      .from('user_roles').select('user_id, role')
      .in('user_id', Array.from(userIds))
    const eligible = new Set<string>(
      (userRoleRows ?? [])
        .filter((r: any) => ['payroll', 'admin', 'super_admin'].includes(r.role))
        .map((r: any) => r.user_id)
    )
    if (eligible.size === 0) { skipped_no_recipients++; continue }

    // Get their emails from profiles
    const { data: profs } = await admin
      .from('profiles').select('id, email, full_name')
      .in('id', Array.from(eligible))

    for (const p of profs ?? []) {
      if (!p.email) continue
      const templateData = {
        recipientName: p.full_name || 'שלום',
        reportDate,
        companyName: info.company_name,
        employees: info.rows.map((r: any) => ({
          full_name: r.full_name,
          company_name: r.company_name,
          gap_type: r.gap_type,
          punches: r.punch_times ?? '',
        })),
      }
      const idempotencyKey = `hr-daily-missing-${companyId}-${p.id}-${target}`
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: 'hr-daily-missing',
          recipientEmail: p.email,
          idempotencyKey,
          templateData,
        }),
      })
      if (resp.ok) queued++
      else errors.push(`${p.email}: ${resp.status} ${await resp.text().catch(() => '')}`)
    }
  }

  return new Response(JSON.stringify({
    date: target, companies: byCompany.size, queued, skipped_no_recipients, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
