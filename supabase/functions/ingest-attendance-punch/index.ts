import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PunchPayload {
  company_id: string;
  employee_code: string;
  punch_at?: string; // ISO timestamp; defaults to now
  direction?: "in" | "out" | "unknown";
  raw?: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const expectedToken = Deno.env.get("ATTENDANCE_INGEST_TOKEN") ?? Deno.env.get("INGEST_TOKEN");
    if (!expectedToken) {
      return json({ error: "server_misconfigured" }, 500);
    }

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token || token !== expectedToken) {
      return json({ error: "unauthorized" }, 401);
    }

    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }

    let body: PunchPayload | PunchPayload[];
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }

    const punches = Array.isArray(body) ? body : [body];
    if (punches.length === 0 || punches.length > 500) {
      return json({ error: "invalid_batch_size" }, 400);
    }

    const HARD_MIN_DATE = new Date(Deno.env.get("ATTENDANCE_HARD_MIN_DATE") ?? "2026-04-01T00:00:00Z");

    for (const p of punches) {
      if (!p.company_id || !p.employee_code) {
        return json({ error: "missing_fields", details: "company_id and employee_code required" }, 400);
      }
    }

    // חוסם רשומות לפני התאריך המינימלי — מגן מפני agent ישן ששולח 2017
    const beforeFilter = punches.length;
    const filteredPunches = punches.filter((p) => {
      if (!p.punch_at) return true;
      const t = new Date(p.punch_at);
      return !isNaN(t.getTime()) && t >= HARD_MIN_DATE;
    });
    const blocked = beforeFilter - filteredPunches.length;
    if (blocked > 0) {
      console.warn(`blocked ${blocked} punches before HARD_MIN_DATE ${HARD_MIN_DATE.toISOString()}`);
    }
    if (filteredPunches.length === 0) {
      return json({ ok: true, received: 0, matched: 0, unmatched: 0, blocked });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const companyIds = [...new Set(filteredPunches.map((p) => p.company_id))];
    const codes = [...new Set(filteredPunches.map((p) => p.employee_code))];

    const { data: employees, error: empErr } = await supabase
      .from("employees")
      .select("id, employee_code, company_id")
      .in("company_id", companyIds)
      .in("employee_code", codes);

    if (empErr) {
      console.error("employees lookup error", empErr);
      return json({ error: "lookup_failed" }, 500);
    }

    const empMap = new Map<string, string>();
    for (const e of employees ?? []) {
      empMap.set(`${e.company_id}::${e.employee_code}`, e.id);
    }

    const rows = filteredPunches.map((p) => {
      const employee_id = empMap.get(`${p.company_id}::${p.employee_code}`) ?? null;
      return {
        company_id: p.company_id,
        employee_id,
        employee_code_raw: p.employee_code,
        punch_at: p.punch_at ?? new Date().toISOString(),
        direction: p.direction ?? "unknown",
        source: "clock",
        status: "pending",
        raw_payload: p.raw ?? null,
      };
    });

    const { error: insErr } = await supabase
      .from("attendance_punches")
      .upsert(rows, { onConflict: "company_id,employee_code_raw,punch_at,direction", ignoreDuplicates: true });
    if (insErr) {
      console.error("insert error", insErr);
      return json({ error: "insert_failed", details: insErr.message }, 500);
    }

    const matched = rows.filter((r) => r.employee_id).length;
    const unmatched = rows.filter((r) => !r.employee_id);

    // Alert payroll about unmatched punches — at most once per day per (company, employee_code).
    if (unmatched.length > 0) {
      try { await notifyUnmatched(supabase, unmatched); }
      catch (e) { console.error("unmatched alert failed", e); }
    }

    return json({ ok: true, received: rows.length, matched, unmatched: unmatched.length, blocked });
  } catch (e) {
    console.error("unhandled", e);
    return json({ error: "internal_error", details: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatDateTimeIL(iso: string): string {
  try {
    const d = new Date(iso);
    const s = d.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    return s;
  } catch { return iso; }
}

function todayILDate(): string {
  const now = new Date();
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const y = il.getFullYear();
  const m = String(il.getMonth() + 1).padStart(2, "0");
  const d = String(il.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function notifyUnmatched(
  supabase: ReturnType<typeof createClient>,
  unmatched: Array<{ company_id: string; employee_code_raw: string; punch_at: string }>,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const alertDate = todayILDate();

  // Group by (company_id, employee_code_raw)
  const groups = new Map<string, { company_id: string; employee_code: string; punches: string[] }>();
  for (const u of unmatched) {
    const k = `${u.company_id}::${u.employee_code_raw}`;
    const g = groups.get(k) ?? { company_id: u.company_id, employee_code: u.employee_code_raw, punches: [] };
    g.punches.push(u.punch_at);
    groups.set(k, g);
  }

  // Try to reserve one alert per (company, code, day). Only newly-inserted rows trigger email.
  const newlyAlerting: typeof groups extends Map<string, infer V> ? V[] : never = [] as any;
  for (const g of groups.values()) {
    const { data, error } = await supabase
      .from("attendance_unmatched_alerts")
      .insert({ company_id: g.company_id, employee_code_raw: g.employee_code, alert_date: alertDate })
      .select("company_id")
      .maybeSingle();
    if (!error && data) newlyAlerting.push(g);
  }
  if (newlyAlerting.length === 0) return;

  // Aggregate by company for a single email per company
  const byCompany = new Map<string, typeof newlyAlerting>();
  for (const g of newlyAlerting) {
    const arr = byCompany.get(g.company_id) ?? [];
    arr.push(g);
    byCompany.set(g.company_id, arr);
  }

  for (const [companyId, groupList] of byCompany.entries()) {
    // Fetch company name + payroll emails
    const { data: company } = await supabase
      .from("companies")
      .select("name, payroll_emails")
      .eq("id", companyId)
      .single();
    const recipientsRaw: string = (company as any)?.payroll_emails ?? "";
    const recipients = recipientsRaw.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (recipients.length === 0) {
      console.warn("no payroll_emails configured for company", companyId);
      continue;
    }

    const entries = groupList.map((g) => {
      const sorted = [...g.punches].sort();
      return {
        employee_code: g.employee_code,
        punch_count: g.punches.length,
        first_punch_at: formatDateTimeIL(sorted[0]),
      };
    });

    for (const to of recipients) {
      const idempotencyKey = `unmatched-punches-${companyId}-${to}-${alertDate}`;
      const resp = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          templateName: "unmatched-punches",
          recipientEmail: to,
          idempotencyKey,
          templateData: { companyName: (company as any)?.name ?? "", entries },
        }),
      });
      if (!resp.ok) {
        console.error("send failed", to, resp.status, await resp.text().catch(() => ""));
      }
    }
  }
}
