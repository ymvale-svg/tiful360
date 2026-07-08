// Weekly HR Excel report: for each company, generate an XLSX of all attendance
// gaps in the past 7 days (missing punches, excluding approved leave/holidays),
// upload to storage, and email a download link to HR/payroll users.
// Scheduled by pg_cron every Thursday at 14:00 Asia/Jerusalem.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as XLSX from 'npm:xlsx@0.18.5'

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  let body: any = {}
  try { body = req.method === 'POST' ? await req.json() : {} } catch {}

  const today = todayIL()
  const from = body?.from
    ? String(body.from)
    : toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
  const to = body?.to ? String(body.to) : toISO(today)
  const requestedCompany: string | undefined = body?.company_id

  // Enumerate dates in [from, to]
  const dates: string[] = []
  {
    const start = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T00:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(toISO(d))
    }
  }

  // Aggregate gaps per (company_id, day)
  const perCompany = new Map<string, { name: string; rows: any[] }>()
  for (const day of dates) {
    const { data, error } = await admin.rpc('get_daily_missing_punches', { _target_date: day })
    if (error) continue
    for (const r of data ?? []) {
      if (requestedCompany && r.company_id !== requestedCompany) continue
      const cur = perCompany.get(r.company_id) ?? { name: r.company_name, rows: [] }
      cur.rows.push({ ...r, day })
      perCompany.set(r.company_id, cur)
    }
  }

  const fromLabel = formatDateIL(from)
  const toLabel = formatDateIL(to)

  let queued = 0
  let companies_with_data = 0
  const errors: string[] = []

  for (const [companyId, info] of perCompany.entries()) {
    if (info.rows.length === 0) continue
    companies_with_data++

    // Build XLSX
    const aoa: any[][] = [
      ['שם עובד', 'תאריך', 'יום', 'סוג פער', 'מס\' החתמות', 'החתמות שבוצעו'],
    ]
    // Sort by name then date
    info.rows.sort((a: any, b: any) =>
      String(a.full_name).localeCompare(String(b.full_name), 'he') || a.day.localeCompare(b.day)
    )
    const empSet = new Set<string>()
    for (const r of info.rows) {
      empSet.add(r.employee_id)
      aoa.push([
        r.full_name,
        formatDateIL(r.day),
        WEEKDAYS[new Date(r.day).getDay()],
        r.gap_type === 'empty' ? 'יום ללא החתמות' : 'החתמה אי-זוגית',
        r.punch_count,
        r.punch_times ?? '',
      ])
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    wb.Workbook = { Views: [{ RTL: true }] }
    XLSX.utils.book_append_sheet(wb, ws, 'חוסרים')
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer

    const filename = `hr-reports/${companyId}/${from}_${to}_${crypto.randomUUID().slice(0, 8)}.xlsx`
    const { error: upErr } = await admin.storage.from('email-assets').upload(
      filename, new Uint8Array(arr), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      })
    if (upErr) { errors.push(`upload ${companyId}: ${upErr.message}`); continue }
    const { data: urlData } = admin.storage.from('email-assets').getPublicUrl(filename)
    const downloadUrl = urlData.publicUrl

    // Recipients: hr_emails first (fallback to payroll_emails)
    const { data: comp } = await admin
      .from('companies')
      .select('hr_emails, payroll_emails')
      .eq('id', companyId)
      .maybeSingle()
    const parseList = (raw: any): string[] =>
      String(raw ?? '')
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^\S+@\S+\.\S+$/.test(s))
    const hrList = parseList((comp as any)?.hr_emails)
    const recipients = hrList.length ? hrList : parseList((comp as any)?.payroll_emails)
    if (recipients.length === 0) continue

    for (const email of recipients) {
      const templateData = {
        recipientName: 'שלום',
        companyName: info.name,
        fromDate: fromLabel,
        toDate: toLabel,
        gapCount: info.rows.length,
        employeeCount: empSet.size,
        downloadUrl,
      }
      const idempotencyKey = `hr-weekly-gaps-${companyId}-${email}-${from}-${to}`
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: 'hr-weekly-gaps',
          recipientEmail: email,
          idempotencyKey,
          templateData,
        }),
      })
      if (resp.ok) queued++
      else errors.push(`${email}: ${resp.status} ${await resp.text().catch(() => '')}`)
    }
  }

    for (const p of profs ?? []) {
      if (!p.email) continue
      const templateData = {
        recipientName: p.full_name || 'שלום',
        companyName: info.name,
        fromDate: fromLabel,
        toDate: toLabel,
        gapCount: info.rows.length,
        employeeCount: empSet.size,
        downloadUrl,
      }
      const idempotencyKey = `hr-weekly-gaps-${companyId}-${p.id}-${from}-${to}`
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: 'hr-weekly-gaps',
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
    from, to, companies_with_data, queued, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
