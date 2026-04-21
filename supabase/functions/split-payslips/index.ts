// Split monthly payslip PDF into per-employee PDFs and extract balances.
// Matching is done by Israeli ID number (תעודת זהות) detected in each page.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { PDFDocument } from 'https://esm.sh/pdf-lib@1.17.1';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

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
  if (digits.length < 5 || digits.length > 9) return null;
  return digits.padStart(9, '0');
}

function extractFields(text: string): Omit<PageInfo, 'pageIndex' | 'text'> {
  // Normalize whitespace (Hebrew PDFs often have lots of NBSPs)
  const t = text.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');

  // ID number: ת.ז. / ת"ז / תעודת זהות / מספר זהות followed by 5-9 digits
  const idM =
    t.match(/(?:ת\s*[.״"']?\s*ז\s*[.״"']?|תעודת\s*זהות|מספר\s*זהות)\s*[:\-]?\s*(\d{5,9})/) ||
    t.match(/\bז\s*[.״"']?\s*ת\s*[.״"']?\s*[:\-]?\s*(\d{5,9})/);

  const periodM = t.match(/תלוש\s*שכר\s*לחודש\s*(\d{1,2})\s*\/\s*(\d{4})/);
  const grossM = t.match(/סה["״]כ\s*תשלומים\s*([\d,]+\.?\d*)/);
  const netM = t.match(/שכר\s*נטו\s*([\d,]+\.?\d*)/);
  const workDaysM = t.match(/ימי\s*עבודה\s*(\d+)/);
  const workHoursM = t.match(/שעות\s*עבודה\s*([\d.]+)/);

  // Vacation block: find "חשבון חופשה" then nearest "יתרה חדשה <num>"
  const vacBlock = t.match(/חשבון\s*חופשה[\s\S]{0,400}?יתרה\s*חדשה\s*([\d.,]+)/);
  const sickBlock = t.match(/חשבון\s*מחלה[\s\S]{0,400}?יתרה\s*חדשה\s*([\d.,]+)/);

  // Employee name: line after "לכבוד"
  let employeeName: string | null = null;
  const nameM = t.match(/לכבוד\s+([^\n\r]+?)(?:\s{2,}|מספר|ת\.?ז|$)/);
  if (nameM) employeeName = nameM[1].trim().slice(0, 100);

  return {
    idNumber: normalizeIdNumber(idM?.[1]),
    month: periodM ? parseInt(periodM[1], 10) : null,
    year: periodM ? parseInt(periodM[2], 10) : null,
    grossSalary: parseNumber(grossM?.[1]),
    netSalary: parseNumber(netM?.[1]),
    workDays: workDaysM ? parseInt(workDaysM[1], 10) : null,
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

    // User-scoped client to verify the caller
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Service-role client for DB ops
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { company_id, period_year, period_month, pdf_base64, original_filename } = body;

    if (!company_id || !period_year || !period_month || !pdf_base64) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorize: caller must be admin/it_manager of company OR super_admin
    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    const isSuper = roleSet.has('super_admin');
    if (!isSuper) {
      if (!(roleSet.has('admin') || roleSet.has('it_manager'))) {
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

    // Decode PDF
    const binary = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
    const sourceDoc = await PDFDocument.load(binary, { ignoreEncryption: true });
    const totalPages = sourceDoc.getPageCount();

    // Extract text per page using unpdf
    const pdfProxy = await getDocumentProxy(binary);
    const pages: PageInfo[] = [];
    for (let i = 0; i < totalPages; i++) {
      let pageText = '';
      try {
        const { text } = await extractText(pdfProxy, { mergePages: false });
        pageText = Array.isArray(text) ? (text[i] ?? '') : (text ?? '');
      } catch (_e) {
        pageText = '';
      }
      const fields = extractFields(pageText);
      pages.push({ pageIndex: i, text: pageText, ...fields });
    }

    // Group consecutive pages by idNumber (a payslip can span multiple pages).
    // Pages without an ID are appended as continuation of the previous group.
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
        };
      } else {
        currentGroup = { idNumber: id, pageIndices: [p.pageIndex], primary: p };
        groups.push(currentGroup);
      }
    }

    // Lookup employees of this company by id_number
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

    // Create batch row
    const { data: batchRow, error: batchErr } = await admin.from('payslip_batches').insert({
      company_id,
      period_year,
      period_month,
      total_pages: totalPages,
      original_filename: original_filename ?? null,
      created_by: user.id,
      status: 'processing',
    }).select().single();
    if (batchErr) throw batchErr;
    const batchId = batchRow.id;

    let matchedCount = 0;
    let unmatchedCount = 0;
    let failedCount = 0;
    const unmatchedIdNumbers: string[] = [];
    const balanceChanges: any[] = [];

    for (const group of groups) {
      try {
        // Build per-employee PDF
        const newDoc = await PDFDocument.create();
        const copied = await newDoc.copyPages(sourceDoc, group.pageIndices);
        copied.forEach((p) => newDoc.addPage(p));
        const pdfBytes = await newDoc.save();

        const normalizedId = group.idNumber;
        const matched = idMap.get(normalizedId);

        const filenameSafe = (matched?.full_name ?? group.primary.employeeName ?? 'unknown')
          .replace(/[^ \u0590-\u05FFa-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').slice(0, 40);
        const storagePath = `${company_id}/${period_year}-${String(period_month).padStart(2, '0')}/${normalizedId}_${filenameSafe}.pdf`;

        // Upload
        const { error: uploadErr } = await admin.storage
          .from('payslips')
          .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: true });
        if (uploadErr) throw uploadErr;

        if (matched) {
          // Read previous balance for diff
          const { data: prevEmp } = await admin.from('employees')
            .select('vacation_balance, sick_balance, full_name')
            .eq('id', matched.id).single();

          // Upsert payslip
          const { error: psErr } = await admin.from('payslips').upsert({
            company_id,
            employee_id: matched.id,
            id_number_detected: normalizedId,
            employee_name_detected: group.primary.employeeName,
            period_year,
            period_month,
            pdf_url: storagePath,
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

          // Update employee balances
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
          // Save as unmatched
          await admin.from('payslips').insert({
            company_id,
            employee_id: null,
            id_number_detected: normalizedId,
            employee_name_detected: group.primary.employeeName,
            period_year,
            period_month,
            pdf_url: storagePath,
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

    // Update batch summary
    await admin.from('payslip_batches').update({
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      failed_count: failedCount,
      status: 'done',
    }).eq('id', batchId);

    // Activity log
    await admin.from('activity_log').insert({
      company_id,
      action: `העלאת תלושי שכר ${period_month}/${period_year}`,
      details: `סה"כ ${totalPages} עמודים, ${matchedCount} הותאמו, ${unmatchedCount} לא הותאמו, ${failedCount} נכשלו`,
      entity_type: 'payslip_batch',
      entity_id: batchId,
      performed_by: user.id,
    });

    return new Response(JSON.stringify({
      batch_id: batchId,
      total_pages: totalPages,
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
