// Monthly payroll Excel report: for each company, generate an XLSX of all attendance
// gaps in the previous calendar month (missing punches, excluding approved leave/holidays),
// upload to storage, and email a download link to payroll accountants (companies.payroll_emails).
// Scheduled by pg_cron on the 1st of each month at 08:00 Asia/Jerusalem.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as XLSX from 'npm:xlsx@0.18.5'
import { sendTemplateEmailLogged } from '../_shared/send-email-logged.ts'

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
  // period: 'previous_month' (default) | 'current_month'
  const period = String(body?.period ?? 'previous_month')
  // recipients: 'company_emails' (default, companies.payroll_emails) | 'roles' (users with hr/payroll roles)
  const recipientsMode = String(body?.recipients ?? 'company_emails')

  const firstOfCurrent = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastOfPrev = new Date(firstOfCurrent.getTime() - 24 * 60 * 60 * 1000)
  const firstOfPrev = new Date(lastOfPrev.getFullYear(), lastOfPrev.getMonth(), 1)
  const periodStart = period === 'current_month' ? firstOfCurrent : firstOfPrev
  const periodEnd = period === 'current_month' ? today : lastOfPrev

  const from = body?.from ? String(body.from) : toISO(periodStart)
  const to = body?.to ? String(body.to) : toISO(periodEnd)
  const requestedCompany: string | undefined = body?.company_id
  const monthLabel = `${String(periodEnd.getMonth() + 1).padStart(2, '0')}/${periodEnd.getFullYear()}`


  // Enumerate dates in [from, to]
  const dates: string[] = []
  {
    const start = new Date(from + 'T00:00:00')
    const end = new Date(to + 'T00:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(toISO(d))
    }
  }

  // Aggregate gaps per company
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

    // Build XLSX (RTL)
    const aoa: any[][] = [
      ['שם עובד', 'תאריך', 'יום', 'סוג פער', "מס' החתמות", 'החתמות שבוצעו'],
    ]
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

    const filename = `payroll-reports/${companyId}/${from}_${to}_${crypto.randomUUID().slice(0, 8)}.xlsx`
    const { error: upErr } = await admin.storage.from('hr-reports').upload(
      filename, new Uint8Array(arr), {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      })
    if (upErr) { errors.push(`upload ${companyId}: ${upErr.message}`); continue }
    // Private bucket: short-lived signed URL (14 days) instead of a permanent public link
    const { data: urlData, error: signErr } = await admin.storage
      .from('hr-reports')
      .createSignedUrl(filename, 60 * 60 * 24 * 14)
    if (signErr || !urlData?.signedUrl) { errors.push(`sign ${companyId}: ${signErr?.message ?? 'no url'}`); continue }
    const downloadUrl = urlData.signedUrl

    // Recipients
    const parseList = (raw: any): string[] =>
      String(raw ?? '')
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter((s) => /^\S+@\S+\.\S+$/.test(s))

    let recipients: string[] = []
    if (recipientsMode === 'roles') {
      // Users of this company holding hr / payroll roles
      const { data: access } = await admin
        .from('user_company_access')
        .select('user_id')
        .eq('company_id', companyId)
      const userIds = (access ?? []).map((a: any) => a.user_id)
      if (userIds.length > 0) {
        const { data: roleRows } = await admin
          .from('user_roles')
          .select('user_id')
          .in('user_id', userIds)
          .in('role', ['hr', 'payroll'])
        const targetIds = [...new Set((roleRows ?? []).map((r: any) => r.user_id))]
        for (const uid of targetIds) {
          const { data: u } = await admin.auth.admin.getUserById(uid)
          const email = u?.user?.email
          if (email && /^\S+@\S+\.\S+$/.test(email)) recipients.push(email)
        }
      }
      recipients = [...new Set(recipients)]
    } else {
      const { data: comp } = await admin
        .from('companies')
        .select('payroll_emails')
        .eq('id', companyId)
        .maybeSingle()
      recipients = parseList((comp as any)?.payroll_emails)
    }
    if (recipients.length === 0) continue


    for (const email of recipients) {
      const templateData = {
        recipientName: 'שלום',
        companyName: info.name,
        monthLabel,
        fromDate: fromLabel,
        toDate: toLabel,
        gapCount: info.rows.length,
        employeeCount: empSet.size,
        downloadUrl,
      }
      const idempotencyKey = `payroll-monthly-gaps-${recipientsMode}-${companyId}-${email}-${from}-${to}`
      const result = await sendTemplateEmailLogged(admin, 'payroll-monthly-gaps', email, {
        templateData,
        idempotencyKey,
      })
      if (result.sent) queued++
      else if (result.error) errors.push(`${email}: ${result.error}`)
    }
  }

  return new Response(JSON.stringify({
    from, to, monthLabel, companies_with_data, queued, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
