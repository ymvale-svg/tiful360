// Daily HR report: list of employees who did not punch today and did not
// have an approved leave/sick request. Sent by default to the HR user
// (companies.hr_emails), with fallback to payroll_emails, and also includes
// an XLSX (RTL) download link like the weekly report.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import * as XLSX from 'npm:xlsx@0.18.5'

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

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
  const target: string = body?.date || todayIL()
  const requestedCompany: string | undefined = body?.company_id

  const { data: rows, error } = await admin.rpc('get_daily_missing_punches', { _target_date: target })
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const byCompany = new Map<string, { company_name: string; rows: any[] }>()
  for (const r of rows ?? []) {
    if (requestedCompany && r.company_id !== requestedCompany) continue
    const cur = byCompany.get(r.company_id) ?? { company_name: r.company_name, rows: [] }
    cur.rows.push(r)
    byCompany.set(r.company_id, cur)
  }

  if (requestedCompany && !byCompany.has(requestedCompany)) {
    const { data: c } = await admin.from('companies').select('name').eq('id', requestedCompany).single()
    byCompany.set(requestedCompany, { company_name: c?.name ?? '', rows: [] })
  }

  const reportDate = formatDateIL(target)
  let queued = 0
  let skipped_no_recipients = 0
  let skipped_agent_down = 0
  const errors: string[] = []

  // Skip companies where the attendance agent didn't record any punches on
  // the target date (clock software wasn't reading — avoid false alarms).
  const dayStartIL = `${target}T00:00:00+03:00`
  const dayEndIL = `${target}T23:59:59+03:00`
  const companyIds = [...byCompany.keys()]
  const companyHasPunches = new Set<string>()
  if (companyIds.length > 0) {
    const { data: punchRows } = await admin
      .from('attendance_punches')
      .select('company_id')
      .in('company_id', companyIds)
      .gte('punch_at', dayStartIL)
      .lte('punch_at', dayEndIL)
      .limit(5000)
    for (const p of punchRows ?? []) companyHasPunches.add((p as any).company_id)
  }

  for (const [companyId, info] of byCompany.entries()) {
    if (!companyHasPunches.has(companyId)) { skipped_agent_down++; continue }
    // Recipients: HR only (payroll is a separate role with its own reports)
    const { data: comp } = await admin
      .from('companies')
      .select('hr_emails')
      .eq('id', companyId)
      .maybeSingle()
    const recipients = parseEmailList((comp as any)?.hr_emails)
    if (recipients.length === 0) { skipped_no_recipients++; continue }


    // Build XLSX (RTL) if there are any gaps
    let downloadUrl: string | undefined
    if (info.rows.length > 0) {
      const aoa: any[][] = [
        ['שם עובד', 'תאריך', 'יום', 'סוג פער', "מס' החתמות", 'החתמות שבוצעו'],
      ]
      info.rows.sort((a: any, b: any) =>
        String(a.full_name).localeCompare(String(b.full_name), 'he')
      )
      for (const r of info.rows) {
        aoa.push([
          r.full_name,
          reportDate,
          WEEKDAYS[new Date(target).getDay()],
          r.gap_type === 'empty' ? 'יום ללא החתמות' : 'החתמה אי-זוגית',
          r.punch_count ?? 0,
          r.punch_times ?? '',
        ])
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 40 }]
      const wb = XLSX.utils.book_new()
      wb.Workbook = { Views: [{ RTL: true }] }
      XLSX.utils.book_append_sheet(wb, ws, 'החתמות חסרות')
      const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
      const filename = `hr-reports/${companyId}/daily_${target}_${crypto.randomUUID().slice(0, 8)}.xlsx`
      const { error: upErr } = await admin.storage.from('email-assets').upload(
        filename, new Uint8Array(arr), {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: false,
        })
      if (upErr) errors.push(`upload ${companyId}: ${upErr.message}`)
      else {
        const { data: urlData } = admin.storage.from('email-assets').getPublicUrl(filename)
        downloadUrl = urlData.publicUrl
      }
    }

    for (const email of recipients) {
      const templateData = {
        recipientName: 'שלום',
        reportDate,
        companyName: info.company_name,
        downloadUrl,
        employees: info.rows.map((r: any) => ({
          full_name: r.full_name,
          company_name: r.company_name,
          gap_type: r.gap_type,
          punches: r.punch_times ?? '',
        })),
      }
      const idempotencyKey = `hr-daily-missing-${companyId}-${email}-${target}`
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: 'hr-daily-missing',
          recipientEmail: email,
          idempotencyKey,
          templateData,
        }),
      })
      if (resp.ok) queued++
      else errors.push(`${email}: ${resp.status} ${await resp.text().catch(() => '')}`)
    }
  }

  return new Response(JSON.stringify({
    date: target, companies: byCompany.size, queued, skipped_no_recipients, errors,
  }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
