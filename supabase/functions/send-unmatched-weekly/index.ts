// Weekly unmatched-punches report: aggregates attendance_punches with no
// matched employee_id from the past 7 days per company and emails the
// payroll accountants (companies.payroll_emails).
// Scheduled by pg_cron every Thursday at 14:00 Asia/Jerusalem.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

function todayIL(): Date {
  const now = new Date()
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
}
function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}
function formatDateIL(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function formatDateTimeIL(ts: string): string {
  const d = new Date(ts)
  const il = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  const dd = String(il.getDate()).padStart(2, '0')
  const mm = String(il.getMonth() + 1).padStart(2, '0')
  const yy = il.getFullYear()
  const hh = String(il.getHours()).padStart(2, '0')
  const mn = String(il.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${hh}:${mn}`
}
function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return []
  return String(raw)
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^\S+@\S+\.\S+$/.test(s))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let body: any = {}
  try { body = req.method === 'POST' ? await req.json() : {} } catch {}

  const today = todayIL()
  const fromISO = body?.from
    ? String(body.from)
    : toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
  const toISOStr = body?.to ? String(body.to) : toISO(today)
  const requestedCompany: string | undefined = body?.company_id

  // Fetch unmatched punches in the window
  let q = admin
    .from('attendance_punches')
    .select('company_id, employee_code_raw, punched_at')
    .is('employee_id', null)
    .gte('punched_at', `${fromISO}T00:00:00+00:00`)
    .lte('punched_at', `${toISOStr}T23:59:59+00:00`)
    .limit(10000)
  if (requestedCompany) q = q.eq('company_id', requestedCompany)
  const { data: punches, error } = await q
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Group by company + employee_code_raw
  type Agg = { count: number; first: string; last: string }
  const byCompany = new Map<string, Map<string, Agg>>()
  for (const p of punches ?? []) {
    const code = String(p.employee_code_raw ?? '').trim()
    if (!code) continue
    const compMap = byCompany.get(p.company_id) ?? new Map<string, Agg>()
    const cur = compMap.get(code) ?? { count: 0, first: p.punched_at, last: p.punched_at }
    cur.count++
    if (p.punched_at < cur.first) cur.first = p.punched_at
    if (p.punched_at > cur.last) cur.last = p.punched_at
    compMap.set(code, cur)
    byCompany.set(p.company_id, compMap)
  }

  const fromLabel = formatDateIL(fromISO)
  const toLabel = formatDateIL(toISOStr)
  let queued = 0
  const errors: string[] = []
  let companies_with_data = 0

  for (const [companyId, codeMap] of byCompany.entries()) {
    if (codeMap.size === 0) continue
    companies_with_data++

    const { data: comp } = await admin
      .from('companies')
      .select('name, payroll_emails')
      .eq('id', companyId)
      .maybeSingle()
    const recipients = parseEmailList((comp as any)?.payroll_emails)
    if (recipients.length === 0) continue

    const rows = Array.from(codeMap.entries())
      .map(([code, a]) => ({
        employee_code: code,
        punch_count: a.count,
        first_seen: formatDateTimeIL(a.first),
        last_seen: formatDateTimeIL(a.last),
      }))
      .sort((a, b) => Number(a.employee_code) - Number(b.employee_code) || a.employee_code.localeCompare(b.employee_code))

    for (const email of recipients) {
      const idempotencyKey = `unmatched-weekly-${companyId}-${email}-${fromISO}-${toISOStr}`
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: 'unmatched-punches-weekly',
          recipientEmail: email,
          idempotencyKey,
          templateData: {
            recipientName: 'שלום',
            companyName: (comp as any)?.name ?? '',
            fromDate: fromLabel,
            toDate: toLabel,
            rows,
          },
        }),
      })
      if (resp.ok) queued++
      else errors.push(`${email}: ${resp.status} ${await resp.text().catch(() => '')}`)
    }
  }

  return new Response(JSON.stringify({
    from: fromISO, to: toISOStr, companies_with_data, queued, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
