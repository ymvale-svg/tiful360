// Process monthly payslip PDF: extract text, group pages by Israeli ID,
// split the source PDF into per-employee PDFs (using pdf-lib), upload each,
// and store a row per group with a private pdf_url pointing to that employee's file.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface PageInfo {
  pageIndex: number;
  text: string;
  idNumber: string | null;
  year: number | null;
  month: number | null;
  vacationBalance: number | null;
  sickBalance: number | null;
  grossSalary: number | null;
  netSalary: number | null;
  workDays: number | null;
  workHours: number | null;
  employeeName: string | null;
}

function parseNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeIdNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 9) return null;
  return digits.padStart(9, '0');
}

const ID_LABEL = '(?:מספר[ו]?\\s*[:\\-]?\\s*זהות[ו]?|זהות[ו]?\\s*[:\\-]?\\s*מספר[ו]?|תעודת\\s*זהות)';

function isNoiseContext(text: string, captured: string): boolean {
  const escaped = captured.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const noisePatterns = [
    new RegExp(`תיק\\s*ניכויים\\s*[:\\-]?\\s*${escaped}`),
    new RegExp(`${escaped}\\s*[:\\-]?\\s*תיק\\s*ניכויים`),
    new RegExp(`מספר\\s*תאגיד\\s*[:\\-]?\\s*${escaped}`),
    new RegExp(`${escaped}\\s*[:\\-]?\\s*תאגיד`),
    new RegExp(`תיק\\s*ב[י'"\`]?\\s*ל\\s*[:\\-]?\\s*${escaped}`),
    new RegExp(`${escaped}\\s*[:\\-]?\\s*תיק\\s*ב[י'"\`]?\\s*ל`),
    new RegExp(`מספר\\s*העובד\\s*[:\\-]?\\s*${escaped}`),
    new RegExp(`${escaped}\\s*[:\\-]?\\s*העובד`),
    new RegExp(`חשבון\\s*[:\\-]?\\s*${escaped}`),
  ];
  return noisePatterns.some((p) => p.test(text));
}

function findIdNumber(t: string): string | null {
  const patterns: RegExp[] = [
    new RegExp(`${ID_LABEL}\\s*[:\\-]?\\s*(\\d{7,9})\\b`, 'g'),
    new RegExp(`\\b(\\d{7,9})\\s*[:\\-]?\\s*${ID_LABEL}`, 'g'),
    /\bת\s*[.״"'`]\s*ז\s*[.״"'`]?\s*[:\-]?\s*(\d{7,9})\b/g,
    /\b(\d{7,9})\s*[:\-]?\s*ת\s*[.״"'`]\s*ז\s*[.״"'`]?/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const captured = m[1];
      if (!isNoiseContext(t, captured)) return captured;
    }
  }
  return null;
}

// Try LTR pattern first, fallback to RTL (label-after-value).
function tryMatch(t: string, ltr: RegExp, rtl: RegExp): RegExpMatchArray | null {
  return t.match(ltr) ?? t.match(rtl);
}

function extractPeriod(t: string, fallback: { year: number; month: number }): { year: number | null; month: number | null } {
  // LTR: "תלוש שכר לחודש MM/YYYY"
  let m = t.match(/תלוש\s*שכר\s*לחוד[ש]?\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})/);
  if (m) {
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) return { month, year };
  }
  // RTL: "YYYY/MM לחודש שכר תלוש" or "YY/MM לחוד שכר תלוש"
  m = t.match(/(\d{2,4})\s*[\/\-]\s*(\d{1,2})\s*לחוד[ש]?\s*שכר\s*תלוש/);
  if (m) {
    let year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) return { month, year };
  }
  // RTL inverted: "MM/YYYY לחודש שכר תלוש"
  m = t.match(/(\d{1,2})\s*[\/\-]\s*(\d{2,4})\s*לחוד[ש]?\s*שכר\s*תלוש/);
  if (m) {
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12) return { month, year };
  }
  return { month: null, year: null };
}

function extractFields(text: string, fallbackPeriod: { year: number; month: number }): Omit<PageInfo, 'pageIndex' | 'text'> {
  const t = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');

  const idRaw = findIdNumber(t);
  const period = extractPeriod(t, fallbackPeriod);

  // Gross
  const grossM = tryMatch(t,
    /סה["״]כ\s*תשלומים\s*([\d,]+\.?\d*)/,
    /([\d,]+\.?\d*)\s*תשלומים\s*סה["״]כ/
  );
  // Net
  const netM = tryMatch(t,
    /שכר\s*נטו\s*([\d,]+\.?\d*)/,
    /([\d,]+\.?\d*)\s*נטו\s*שכר/
  );
  // Work days
  const workDaysM = tryMatch(t,
    /ימי\s*עבודה\s*(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*עבודה\s*ימי/
  );
  // Work hours
  const workHoursM = tryMatch(t,
    /שעות\s*עבודה\s*([\d.,]+)/,
    /([\d.,]+)\s*עבודה\s*שעות/
  );

  // Vacation balance: try both orders
  let vacBlock = t.match(/חשבון\s*חופשה[\s\S]{0,400}?יתרה\s*חדשה\s*([\d.,]+)/);
  if (!vacBlock) vacBlock = t.match(/([\d.,]+)\s*חדשה\s*יתרה[\s\S]{0,400}?חופשה\s*חשבון/);
  if (!vacBlock) vacBlock = t.match(/חופשה[\s\S]{0,200}?יתרה\s*חדשה\s*([\d.,]+)/);
  if (!vacBlock) vacBlock = t.match(/([\d.,]+)\s*חדשה\s*יתרה[\s\S]{0,200}?חופשה/);

  // Sick balance: try both orders
  let sickBlock = t.match(/חשבון\s*מחלה[\s\S]{0,400}?יתרה\s*חדשה\s*([\d.,]+)/);
  if (!sickBlock) sickBlock = t.match(/([\d.,]+)\s*חדשה\s*יתרה[\s\S]{0,400}?מחלה\s*חשבון/);
  if (!sickBlock) sickBlock = t.match(/מחלה[\s\S]{0,200}?יתרה\s*חדשה\s*([\d.,]+)/);
  if (!sickBlock) sickBlock = t.match(/([\d.,]+)\s*חדשה\s*יתרה[\s\S]{0,200}?מחלה/);

  let employeeName: string | null = null;
  const nameM = t.match(/לכבוד\s+([^\n\r]+?)(?:\s{2,}|מספר|ת\.?ז|$)/);
  if (nameM) employeeName = nameM[1].trim().slice(0, 100);

  return {
    idNumber: normalizeIdNumber(idRaw),
    month: period.month,
    year: period.year,
    grossSalary: parseNumber(grossM?.[1]),
    netSalary: parseNumber(netM?.[1]),
    workDays: workDaysM ? parseFloat(workDaysM[1]) : null,
    workHours: parseNumber(workHoursM?.[1]),
    vacationBalance: parseNumber(vacBlock?.[1]),
    sickBalance: parseNumber(sickBlock?.[1]),
    employeeName,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { company_id, period_year, period_month, pdf_base64, original_filename } = body;

    if (!company_id || !period_year || !period_month || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorize
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isSuper = roleSet.has('super_admin');
    if (!isSuper) {
      if (!(roleSet.has('admin') || roleSet.has('it_manager') || roleSet.has('payroll'))) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: access } = await admin.from('user_company_access')
        .select('company_id').eq('user_id', user.id).eq('company_id', company_id).maybeSingle();
      if (!access) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const binary = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));

    // Extract text for ALL pages in one pass
    const pdfProxy = await getDocumentProxy(binary);
    const totalPages = pdfProxy.numPages ?? 0;
    let allTexts: string[] = [];
    try {
      const { text } = await extractText(pdfProxy, { mergePages: false });
      allTexts = Array.isArray(text) ? text : [text ?? ''];
    } catch (e) {
      console.error('extractText failed:', e);
      allTexts = new Array(totalPages).fill('');
    }
    const effectivePages = Math.max(totalPages, allTexts.length);

    console.log('split-payslips: totalPages=', totalPages,
      'extractedTexts=', allTexts.length,
      'page1 first 300 chars:', (allTexts[0] ?? '').slice(0, 300));

    const fallbackPeriod = { year: period_year, month: period_month };
    const pages: PageInfo[] = [];
    for (let i = 0; i < effectivePages; i++) {
      const pageText = allTexts[i] ?? '';
      const fields = extractFields(pageText, fallbackPeriod);
      pages.push({ pageIndex: i, text: pageText, ...fields });
      console.log(`split-payslips: page ${i} idDetected=${fields.idNumber} period=${fields.month}/${fields.year} firstChars=${pageText.slice(0, 150)}`);
    }

    // Group consecutive pages by idNumber
    const groups: { idNumber: string; pageIndices: number[]; primary: PageInfo }[] = [];
    let currentGroup: typeof groups[0] | null = null;
    for (const p of pages) {
      const id = p.idNumber;
      if (!id) {
        if (currentGroup) currentGroup.pageIndices.push(p.pageIndex);
        continue;
      }
      if (currentGroup && currentGroup.idNumber === id) {
        currentGroup.pageIndices.push(p.pageIndex);
        const cur = currentGroup.primary;
        currentGroup.primary = {
          ...cur,
          vacationBalance: cur.vacationBalance ?? p.vacationBalance,
          sickBalance: cur.sickBalance ?? p.sickBalance,
          grossSalary: cur.grossSalary ?? p.grossSalary,
          netSalary: cur.netSalary ?? p.netSalary,
          workDays: cur.workDays ?? p.workDays,
          workHours: cur.workHours ?? p.workHours,
          employeeName: cur.employeeName ?? p.employeeName,
          month: cur.month ?? p.month,
          year: cur.year ?? p.year,
        };
      } else {
        currentGroup = { idNumber: id, pageIndices: [p.pageIndex], primary: p };
        groups.push(currentGroup);
      }
    }

    // Lookup employees by id_number
    const { data: employees } = await admin
      .from('employees')
      .select('id, full_name, id_number')
      .eq('company_id', company_id)
      .not('id_number', 'is', null);

    const idMap = new Map<string, { id: string; full_name: string }>();
    for (const e of employees ?? []) {
      const norm = normalizeIdNumber(e.id_number);
      if (norm) idMap.set(norm, { id: e.id, full_name: e.full_name });
    }

    console.log('split-payslips: groups=', groups.length,
      'employees loaded=', employees?.length ?? 0,
      'idMap size=', idMap.size);

    // Create batch
    const { data: batchRow, error: batchErr } = await admin.from('payslip_batches').insert({
      company_id,
      period_year,
      period_month,
      total_pages: effectivePages,
      original_filename: original_filename ?? null,
      created_by: user.id,
      status: 'processing',
    }).select().single();
    if (batchErr) throw batchErr;
    const batchId = batchRow.id;

    // Upload ORIGINAL PDF once (kept as a backup / source_pdf_url)
    const sourcePath = `${company_id}/${period_year}-${String(period_month).padStart(2, '0')}/_source_${batchId}.pdf`;
    const { error: srcUploadErr } = await admin.storage
      .from('payslips')
      .upload(sourcePath, binary, { contentType: 'application/pdf', upsert: true });
    if (srcUploadErr) throw srcUploadErr;

    // === SPLIT: build a per-employee PDF for each group ===
    // Load source once with pdf-lib, then copyPages into a fresh doc per group.
    const sourceDoc = await PDFDocument.load(binary);
    const groupPdfPaths = new Map<number, string>(); // groupIndex -> storage path

    const BATCH = 5;
    for (let i = 0; i < groups.length; i += BATCH) {
      const slice = groups.slice(i, i + BATCH);
      await Promise.all(slice.map(async (group, idxInSlice) => {
        const groupIndex = i + idxInSlice;
        try {
          const outDoc = await PDFDocument.create();
          const copied = await outDoc.copyPages(sourceDoc, group.pageIndices);
          for (const pg of copied) outDoc.addPage(pg);
          const bytes = await outDoc.save();
          const period = group.primary.year && group.primary.month
            ? `${group.primary.year}-${String(group.primary.month).padStart(2, '0')}`
            : `${period_year}-${String(period_month).padStart(2, '0')}`;
          const path = `${company_id}/${period}/${batchId}_${group.idNumber}.pdf`;
          const { error: upErr } = await admin.storage
            .from('payslips')
            .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
          if (upErr) {
            console.error('per-group upload failed:', group.idNumber, upErr);
            return;
          }
          groupPdfPaths.set(groupIndex, path);
        } catch (e) {
          console.error('split failed for group:', group.idNumber, e);
        }
      }));
      // yield to event loop
      await new Promise((r) => setTimeout(r, 0));
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    let failedCount = 0;
    const unmatchedIdNumbers: string[] = [];
    const balanceChanges: any[] = [];

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      try {
        const normalizedId = group.idNumber;
        const matched = idMap.get(normalizedId);
        const pageIndices = group.pageIndices;
        const groupPdfPath = groupPdfPaths.get(gi) ?? sourcePath;
        // Use detected period when available, otherwise the form's period.
        const recordYear = group.primary.year ?? period_year;
        const recordMonth = group.primary.month ?? period_month;

        console.log(`group ${normalizedId}: vac=${group.primary.vacationBalance} sick=${group.primary.sickBalance} gross=${group.primary.grossSalary} net=${group.primary.netSalary} workDays=${group.primary.workDays} period=${recordMonth}/${recordYear} pdfPath=${groupPdfPath}`);

        if (matched) {
          const { data: prevEmp } = await admin.from('employees')
            .select('vacation_balance, sick_balance, full_name')
            .eq('id', matched.id).single();

          const { error: psErr } = await admin.from('payslips').upsert({
            company_id,
            employee_id: matched.id,
            id_number_detected: normalizedId,
            employee_name_detected: group.primary.employeeName,
            period_year: recordYear,
            period_month: recordMonth,
            source_pdf_url: sourcePath,
            page_indices: pageIndices,
            pdf_url: groupPdfPath,
            vacation_balance: group.primary.vacationBalance,
            sick_balance: group.primary.sickBalance,
            gross_salary: group.primary.grossSalary,
            net_salary: group.primary.netSalary,
            work_days: group.primary.workDays,
            work_hours: group.primary.workHours,
            extraction_status: (group.primary.vacationBalance != null && group.primary.sickBalance != null) ? 'success' : 'partial',
            batch_id: batchId,
            created_by: user.id,
          }, { onConflict: 'employee_id,period_year,period_month' });
          if (psErr) throw psErr;

          if (group.primary.vacationBalance != null || group.primary.sickBalance != null) {
            const updates: any = { balances_updated_at: new Date().toISOString(), balances_source: 'payslip' };
            if (group.primary.vacationBalance != null) updates.vacation_balance = group.primary.vacationBalance;
            if (group.primary.sickBalance != null) updates.sick_balance = group.primary.sickBalance;
            await admin.from('employees').update(updates).eq('id', matched.id);

            balanceChanges.push({
              employee_name: prevEmp?.full_name ?? matched.full_name,
              vacation_old: prevEmp?.vacation_balance,
              vacation_new: group.primary.vacationBalance,
              sick_old: prevEmp?.sick_balance,
              sick_new: group.primary.sickBalance,
            });
          }
          matchedCount++;
        } else {
          await admin.from('payslips').insert({
            company_id,
            employee_id: null,
            id_number_detected: normalizedId,
            employee_name_detected: group.primary.employeeName,
            period_year: recordYear,
            period_month: recordMonth,
            source_pdf_url: sourcePath,
            page_indices: pageIndices,
            pdf_url: groupPdfPath,
            vacation_balance: group.primary.vacationBalance,
            sick_balance: group.primary.sickBalance,
            gross_salary: group.primary.grossSalary,
            net_salary: group.primary.netSalary,
            work_days: group.primary.workDays,
            work_hours: group.primary.workHours,
            extraction_status: 'unmatched',
            batch_id: batchId,
            created_by: user.id,
          });
          unmatchedCount++;
          if (!unmatchedIdNumbers.includes(normalizedId)) unmatchedIdNumbers.push(normalizedId);
        }
      } catch (e) {
        console.error('Group failed:', group.idNumber, e);
        failedCount++;
      }
    }

    await admin.from('payslip_batches').update({
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      failed_count: failedCount,
      status: 'done',
    }).eq('id', batchId);

    await admin.from('activity_log').insert({
      company_id,
      action: `העלאת תלושי שכר ${period_month}/${period_year}`,
      details: `סה"כ ${effectivePages} עמודים, ${matchedCount} הותאמו, ${unmatchedCount} לא הותאמו, ${failedCount} נכשלו`,
      entity_type: 'payslip_batch',
      entity_id: batchId,
      performed_by: user.id,
    });

    return new Response(JSON.stringify({
      batch_id: batchId,
      total_pages: effectivePages,
      groups: groups.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      failed: failedCount,
      unmatched_id_numbers: unmatchedIdNumbers,
      balance_changes: balanceChanges,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('split-payslips error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
