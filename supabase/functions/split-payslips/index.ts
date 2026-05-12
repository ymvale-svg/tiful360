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
    const orphanPages: number[] = []; // pages with no ID detected and no preceding group
    const blankPages: number[] = []; // pages with no extracted text at all
    for (const p of pages) {
      const id = p.idNumber;
      if (!id) {
        if (currentGroup) {
          currentGroup.pageIndices.push(p.pageIndex);
        } else {
          orphanPages.push(p.pageIndex);
          if (!p.text || p.text.trim().length < 20) blankPages.push(p.pageIndex);
        }
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
      .select('id, full_name, id_number, email')
      .eq('company_id', company_id)
      .not('id_number', 'is', null);

    const idMap = new Map<string, { id: string; full_name: string; email: string | null }>();
    for (const e of employees ?? []) {
      const norm = normalizeIdNumber(e.id_number);
      if (norm) idMap.set(norm, { id: e.id, full_name: e.full_name, email: e.email ?? null });
    }

    // Fetch company name once for email subject/body
    const { data: companyRow } = await admin
      .from('companies').select('name').eq('id', company_id).single();
    const companyName = companyRow?.name ?? '';

    // Collect notifications to send after processing
    const payslipNotifications: { to: string; employee_name: string; period_year: number; period_month: number; employee_id: string }[] = [];

    console.log('split-payslips: groups=', groups.length,
      'employees loaded=', employees?.length ?? 0,
      'idMap size=', idMap.size);

    // Overwrite: delete existing payslips for the same company+period
    // (covers re-uploads of the same monthly file).
    const { error: delPsErr } = await admin.from('payslips')
      .delete()
      .eq('company_id', company_id)
      .eq('period_year', period_year)
      .eq('period_month', period_month);
    if (delPsErr) console.error('overwrite delete payslips failed:', delPsErr);
    // Mark prior batches for the same period as superseded so reports stay clean.
    await admin.from('payslip_batches')
      .update({ status: 'superseded' })
      .eq('company_id', company_id)
      .eq('period_year', period_year)
      .eq('period_month', period_month)
      .neq('status', 'superseded');

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
    const groupPdfBytes = new Map<number, Uint8Array>(); // groupIndex -> raw bytes (for AI)

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
          groupPdfBytes.set(groupIndex, bytes);
        } catch (e) {
          console.error('split failed for group:', group.idNumber, e);
        }
      }));
      // yield to event loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // === AI EXTRACTION: send each per-group PDF to Lovable AI for structured field extraction ===
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const aiResults = new Map<number, any>(); // groupIndex -> ai-extracted fields

    if (LOVABLE_API_KEY) {
      const AI_BATCH = 3;
      for (let i = 0; i < groups.length; i += AI_BATCH) {
        const slice = groups.slice(i, i + AI_BATCH);
        await Promise.all(slice.map(async (_group, idxInSlice) => {
          const groupIndex = i + idxInSlice;
          const bytes = groupPdfBytes.get(groupIndex);
          if (!bytes) return;
          try {
            // base64 encode
            let bin = '';
            const chunkSize = 0x8000;
            for (let j = 0; j < bytes.length; j += chunkSize) {
              bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + chunkSize)) as any);
            }
            const b64 = btoa(bin);
            const dataUrl = `data:application/pdf;base64,${b64}`;

            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 45000);
            const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                'Content-Type': 'application/json',
              },
              signal: ctrl.signal,
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  {
                    role: 'system',
                    content: 'אתה מחלץ נתוני תלוש שכר ישראלי. החזר אך ורק קריאה לפונקציה extract_payslip עם הערכים המדויקים שמופיעים במסמך. אם שדה לא מופיע — החזר null. אל תמציא ערכים. שים לב להבדל בין "ימי עבודה" (מספר קטן, בד״כ 17-26) לבין "שעות עבודה" (מספר גדול יותר, בד״כ 100-200). אל תחליף ביניהם.',
                  },
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: 'חלץ את הנתונים מתלוש השכר המצורף. ודא שאתה מחזיר ימי עבודה (לא שעות) בשדה work_days, ושעות עבודה (לא ימים) בשדה work_hours.' },
                      { type: 'image_url', image_url: { url: dataUrl } },
                    ],
                  },
                ],
                tools: [
                  {
                    type: 'function',
                    function: {
                      name: 'extract_payslip',
                      description: 'Extract structured payslip fields',
                      parameters: {
                        type: 'object',
                        properties: {
                          id_number: { type: ['string', 'null'], description: 'תעודת זהות של העובד (9 ספרות)' },
                          employee_name: { type: ['string', 'null'], description: 'שם מלא של העובד' },
                          period_year: { type: ['number', 'null'], description: 'שנת התלוש (YYYY)' },
                          period_month: { type: ['number', 'null'], description: 'חודש התלוש (1-12)' },
                          gross_salary: { type: ['number', 'null'], description: 'סה"כ תשלומים / שכר ברוטו' },
                          net_salary: { type: ['number', 'null'], description: 'שכר נטו לתשלום' },
                          work_days: { type: ['number', 'null'], description: 'ימי עבודה בפועל (מספר ימים, בד"כ 17-26). אל תחזיר שעות כאן.' },
                          work_hours: { type: ['number', 'null'], description: 'סך שעות עבודה בפועל בחודש (בד"כ 100-200 שעות). אל תחזיר ימים כאן.' },
                          vacation_balance: { type: ['number', 'null'], description: 'יתרת חופשה חדשה (בימים)' },
                          sick_balance: { type: ['number', 'null'], description: 'יתרת מחלה חדשה (בימים)' },
                        },
                        required: ['id_number', 'gross_salary', 'net_salary', 'vacation_balance', 'sick_balance'],
                        additionalProperties: false,
                      },
                    },
                  },
                ],
                tool_choice: { type: 'function', function: { name: 'extract_payslip' } },
              }),
            });
            clearTimeout(tid);

            if (!resp.ok) {
              const txt = await resp.text();
              console.error(`AI extraction failed [${resp.status}] for group ${groupIndex}:`, txt.slice(0, 300));
              return;
            }
            const data = await resp.json();
            const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
            if (!toolCall?.function?.arguments) {
              console.warn(`AI returned no tool call for group ${groupIndex}`);
              return;
            }
            const args = JSON.parse(toolCall.function.arguments);
            aiResults.set(groupIndex, args);
            console.log(`AI group ${groupIndex} (${groups[groupIndex].idNumber}):`, JSON.stringify(args));
          } catch (e) {
            console.error(`AI call failed for group ${groupIndex}:`, e instanceof Error ? e.message : e);
          }
        }));
        await new Promise((r) => setTimeout(r, 200));
      }
    } else {
      console.warn('LOVABLE_API_KEY not set — skipping AI extraction');
    }

    // Merge AI results into group.primary (AI wins where present)
    for (let gi = 0; gi < groups.length; gi++) {
      const ai = aiResults.get(gi);
      if (!ai) continue;
      const cur = groups[gi].primary;
      const aiId = normalizeIdNumber(ai.id_number);
      const notes: string[] = [];
      if (aiId && aiId !== groups[gi].idNumber) {
        notes.push(`AI detected different ID: ${aiId} (text-detected: ${groups[gi].idNumber})`);
      }
      groups[gi].primary = {
        ...cur,
        employeeName: ai.employee_name ?? cur.employeeName,
        year: ai.period_year ?? cur.year,
        month: ai.period_month ?? cur.month,
        grossSalary: ai.gross_salary ?? cur.grossSalary,
        netSalary: ai.net_salary ?? cur.netSalary,
        workDays: ai.work_days ?? cur.workDays,
        workHours: ai.work_hours ?? cur.workHours,
        vacationBalance: ai.vacation_balance ?? cur.vacationBalance,
        sickBalance: ai.sick_balance ?? cur.sickBalance,
      };
      (groups[gi] as any)._aiNotes = notes.join('; ');
      (groups[gi] as any)._aiUsed = true;
    }

    let matchedCount = 0;
    let unmatchedCount = 0;
    let failedCount = 0;
    const unmatchedIdNumbers: string[] = [];
    const balanceChanges: any[] = [];
    const matchedPayslips: any[] = [];
    const unmatchedPayslips: any[] = [];
    const failedPayslips: any[] = [];

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

        const aiUsed = (group as any)._aiUsed === true;
        const aiNotes = (group as any)._aiNotes as string | undefined;
        const filledCount = [
          group.primary.grossSalary, group.primary.netSalary,
          group.primary.vacationBalance, group.primary.sickBalance,
          group.primary.workDays, group.primary.workHours,
        ].filter((v) => v != null).length;
        const status = filledCount >= 4 ? 'success' : (filledCount > 0 ? 'partial' : 'failed');

        console.log(`group ${normalizedId}: vac=${group.primary.vacationBalance} sick=${group.primary.sickBalance} gross=${group.primary.grossSalary} net=${group.primary.netSalary} workDays=${group.primary.workDays} period=${recordMonth}/${recordYear} aiUsed=${aiUsed} status=${status} pdfPath=${groupPdfPath}`);

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
            extraction_status: status,
            extraction_notes: aiNotes || (aiUsed ? 'extracted via AI' : null),
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
          matchedPayslips.push({
            employee_name: prevEmp?.full_name ?? matched.full_name ?? group.primary.employeeName,
            id_number: normalizedId,
            pages: pageIndices,
            status,
          });
          if (matched.email) {
            payslipNotifications.push({
              to: matched.email,
              employee_name: prevEmp?.full_name ?? matched.full_name ?? '',
              period_year: recordYear,
              period_month: recordMonth,
              employee_id: matched.id,
            });
          }
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
          unmatchedPayslips.push({
            id_number: normalizedId,
            employee_name: group.primary.employeeName,
            pages: pageIndices,
          });
        }
      } catch (e) {
        console.error('Group failed:', group.idNumber, e);
        const failureMessage = e instanceof Error ? e.message : String(e);
        try {
          await admin.from('payslips').insert({
            company_id,
            employee_id: null,
            id_number_detected: group.idNumber ?? null,
            employee_name_detected: group.primary?.employeeName ?? null,
            period_year: group.primary?.year ?? period_year,
            period_month: group.primary?.month ?? period_month,
            source_pdf_url: sourcePath,
            page_indices: group.pageIndices,
            pdf_url: groupPdfPaths.get(gi) ?? sourcePath,
            vacation_balance: group.primary?.vacationBalance ?? null,
            sick_balance: group.primary?.sickBalance ?? null,
            gross_salary: group.primary?.grossSalary ?? null,
            net_salary: group.primary?.netSalary ?? null,
            work_days: group.primary?.workDays ?? null,
            work_hours: group.primary?.workHours ?? null,
            extraction_status: 'failed',
            extraction_notes: failureMessage.slice(0, 500),
            batch_id: batchId,
            created_by: user.id,
          });
        } catch (recordErr) {
          console.error('Failed to record failed payslip row:', group.idNumber, recordErr);
        }
        failedCount++;
        failedPayslips.push({
          id_number: group.idNumber ?? null,
          employee_name: group.primary?.employeeName ?? null,
          pages: group.pageIndices,
          error: failureMessage.slice(0, 300),
        });
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

    // Notify each matched employee via email that their payslip is available in the personal area
    const portalBase = req.headers.get('origin') ?? 'https://tiful360.com';
    const portalUrl = `${portalBase}/portal`;
    const monthNames = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    for (const n of payslipNotifications) {
      const periodLabel = `${monthNames[n.period_month - 1] ?? n.period_month}/${n.period_year}`;
      const subject = `תלוש השכר שלך לחודש ${periodLabel} זמין באזור האישי`;
      const html = `
        <div dir="rtl" style="font-family: Arial, sans-serif; padding: 24px; max-width: 600px; margin: auto;">
          <h2 style="color: #1f2937;">שלום ${n.employee_name || ''},</h2>
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            תלוש השכר שלך לחודש <strong>${periodLabel}</strong>${companyName ? ` מטעם <strong>${companyName}</strong>` : ''} עלה לאזור האישי שלך.
          </p>
          <p style="margin-top: 20px;">
            <a href="${portalUrl}" target="_blank" style="background: #1d4ed8; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">צפייה בתלוש</a>
          </p>
          <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">הודעה אוטומטית — אין צורך להשיב.</p>
        </div>`;
      try {
        await admin.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            to: n.to,
            subject,
            html,
            template: 'payslip-available',
            metadata: { employee_id: n.employee_id, period_year: n.period_year, period_month: n.period_month, batch_id: batchId },
          },
        });
      } catch (e) {
        console.error('enqueue payslip email failed for', n.to, e);
      }
    }

    const issues: { type: string; title: string; instruction: string; pages?: number[]; ids?: string[] }[] = [];
    if (groups.length === 0) {
      issues.push({
        type: 'no_ids',
        title: 'לא זוהתה אף תעודת זהות בקובץ',
        instruction: 'ייתכן שה-PDF סרוק (תמונה ולא טקסט). הפק את קובץ התלושים מתוכנת השכר כ-PDF טקסטואלי (לא סרוק/לא מודפס מתמונה) ונסה שוב.',
      });
    } else if (orphanPages.length > 0) {
      issues.push({
        type: 'orphan_pages',
        title: `${orphanPages.length} עמודים בתחילת הקובץ ללא זיהוי ת.ז.`,
        instruction: blankPages.length > 0
          ? 'יש עמודים ריקים או שאינם טקסטואליים בתחילת הקובץ. הסר עמודי כריכה/הקדמה והעלה מחדש, או הפק את ה-PDF כקובץ טקסטואלי.'
          : 'העמודים הראשונים אינם מתחילים בתלוש שזוהתה בו ת.ז. ודא שהקובץ מתחיל ישירות בתלוש הראשון, ושלא נוסף עמוד כריכה.',
        pages: orphanPages.map((p) => p + 1),
      });
    }
    if (unmatchedIdNumbers.length > 0) {
      issues.push({
        type: 'unmatched_ids',
        title: `${unmatchedIdNumbers.length} תעודות זהות אינן רשומות במערכת`,
        instruction: 'ת.ז. שזוהתה בתלוש לא קיימת באף תיק עובד פעיל. בדוק שמספר ת.ז. בכרטיס העובד תואם בדיוק (כולל ספרת ביקורת) לזה שבתלוש, או הוסף את העובד לפני העלאה חוזרת.',
        ids: unmatchedIdNumbers,
      });
    }
    if (failedCount > 0) {
      issues.push({
        type: 'failed',
        title: `${failedCount} תלושים נכשלו בעיבוד`,
        instruction: 'ראה פירוט שגיאה לכל תלוש בטבלה. נסה להעלות מחדש; אם הבעיה חוזרת, פנה לתמיכה עם מספר האצווה.',
      });
    }

    return new Response(JSON.stringify({
      batch_id: batchId,
      total_pages: effectivePages,
      groups: groups.length,
      matched: matchedCount,
      unmatched: unmatchedCount,
      failed: failedCount,
      unmatched_id_numbers: unmatchedIdNumbers,
      balance_changes: balanceChanges,
      matched_payslips: matchedPayslips,
      unmatched_payslips: unmatchedPayslips,
      failed_payslips: failedPayslips,
      orphan_pages: orphanPages.map((p) => p + 1),
      issues,
      overwritten: true,
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
