// Runs from pg_cron every morning at 08:00 Asia/Jerusalem.
// For each active tracks-attendance employee whose scheduled work-day (yesterday)
// is missing an in/out punch, enqueue an email using the existing attendance-gaps template.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const APP_URL = 'https://tiful360.com'
const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function formatDateIL(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function yesterdayIL(): string {
  const now = new Date()
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  il.setDate(il.getDate() - 1)
  const y = il.getFullYear()
  const m = String(il.getMonth() + 1).padStart(2, '0')
  const d = String(il.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let target: string
  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    target = body?.date || yesterdayIL()
  } catch { target = yesterdayIL() }

  const { data: rows, error } = await admin.rpc('get_daily_missing_punches', { _target_date: target })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const correctionUrl = `${APP_URL}/portal?tab=attendance&highlight=${target}`
  let queued = 0
  let skipped_no_email = 0
  const errors: string[] = []

  for (const r of rows ?? []) {
    if (!r.email) { skipped_no_email++; continue }
    const templateData = {
      employeeName: r.full_name,
      companyName: r.company_name ?? '',
      fromDate: formatDateIL(target),
      toDate: formatDateIL(target),
      correctionUrl,
      gaps: [{
        date: formatDateIL(target),
        weekday: WEEKDAYS[new Date(target).getDay()],
        type: r.gap_type,
        punches: r.punch_times ?? '',
      }],
    }
    const idempotencyKey = `missing-punch-${r.employee_id}-${target}`
    const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        templateName: 'attendance-gaps',
        recipientEmail: r.email,
        idempotencyKey,
        templateData,
      }),
    })
    if (resp.ok) queued++
    else errors.push(`${r.email}: ${resp.status} ${await resp.text().catch(() => '')}`)
  }

  return new Response(JSON.stringify({ date: target, total: rows?.length ?? 0, queued, skipped_no_email, errors }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
