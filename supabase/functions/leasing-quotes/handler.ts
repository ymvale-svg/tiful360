// Leasing quote requests: draft the request (AI, with a template fallback), send it to the chosen
// leasing companies, and read a returned quote PDF into fields.
//
// Pure: everything outside (clients, AI, email, env) arrives in `deps`, so the handler runs in
// Vitest. index.ts wires the real services.
//
// Actions (POST JSON, caller's JWT):
//   draft    {request_id}                                   → {subject, body, source}
//   send     {request_id, supplier_ids, subject, body}       → {sent, failed}
//   extract  {request_id, path}                              → {fields}
//
// All reads and the request update use the caller's client, so RLS decides who may do what;
// only fleet staff (admins, operations, finance) can update a request. The supplier email never
// carries the employee's name: a quote needs the role, not the person.

export interface QuoteFacts {
  role: string | null;
  department: string | null;
  tierName: string | null;
  monthlyCap: number | null;
  allowedModels: string | null;
  fuel: string | null;
  gearbox: string | null;
  models: string[];
  notes: string | null;
  desiredDate: string | null;
  periodMonths: number;
  companyName: string | null;
}

export interface QuoteFields {
  supplier_name: string | null;
  model: string | null;
  monthly_price: number | null;
  km_per_year: number | null;
  period_months: number | null;
  delivery_date: string | null;
  includes: string | null;
}

export const QUOTE_FIELD_NAMES: Array<keyof QuoteFields> = [
  "supplier_name", "model", "monthly_price", "km_per_year", "period_months", "delivery_date", "includes",
];

// deno-lint-ignore no-explicit-any
type Client = any;

export interface Deps {
  cors: Record<string, string>;
  /** The caller, from the Authorization header; null when not signed in. */
  getUser(authHeader: string): Promise<{ id: string; email: string | null } | null>;
  /** A client acting as the caller (RLS applies). */
  userClient(authHeader: string): Client;
  /** Structured AI call: instructions, optional file (data URL), JSON schema → parsed object. */
  aiJson(args: { instructions: string; fileDataUrl?: string; mime?: string; schema: Record<string, unknown> }): Promise<unknown>;
  sendEmail(args: {
    to: string; subject: string; html: string; label: string; replyTo?: string; companyId: string;
    idempotencyKey: string; metadata: Record<string, unknown>;
  }): Promise<boolean>;
  now(): Date;
}

const MAX_SUPPLIERS = 20;
const MAX_BODY = 8000;
const MAX_FILE_BASE64 = 14_000_000;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text → email HTML: escaped, paragraphs kept, right-to-left. */
export function bodyToHtml(body: string): string {
  const paragraphs = body.trim().split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return `<div dir="rtl" style="direction:rtl;text-align:right;">${paragraphs.join("")}</div>`;
}

const dmy = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

/** The request as a fixed text, used when AI is unavailable and as the facts given to the AI. */
export function buildQuoteRequestDraft(f: QuoteFacts): { subject: string; body: string } {
  const who = [f.role ? `עובד/ת בתפקיד ${f.role}` : "עובד/ת חדש/ה", f.department ? `במחלקת ${f.department}` : null]
    .filter(Boolean).join(" ");
  const lines = [
    "שלום רב,",
    "",
    `נבקש הצעת מחיר לרכב ליסינג תפעולי עבור ${who}.`,
    "",
    f.tierName ? `• רמת רכב: ${f.tierName}${f.monthlyCap ? ` (עד ${f.monthlyCap.toLocaleString("he-IL")} ₪ לחודש)` : ""}` : null,
    f.models.length ? `• דגמים מועדפים: ${f.models.join(", ")}` : null,
    f.allowedModels && !f.models.length ? `• דגמים ברמה: ${f.allowedModels.split(/\n+/).filter(Boolean).join(", ")}` : null,
    f.fuel ? `• הנעה: ${f.fuel}` : null,
    f.gearbox ? `• תיבת הילוכים: ${f.gearbox}` : null,
    `• תקופה: ${f.periodMonths} חודשים`,
    f.desiredDate ? `• מסירה רצויה: ${dmy(f.desiredDate)}` : null,
    f.notes ? `• הערות: ${f.notes}` : null,
    "",
    "נבקש לציין בהצעה: דגם, מחיר חודשי, ק\"מ שנתי כלול, מה כלול במחיר ומועד אספקה.",
    "",
    "תודה,",
    f.companyName ?? "",
  ].filter((l): l is string => l !== null);
  return { subject: `בקשת הצעת מחיר לרכב ליסינג${f.tierName ? ` – ${f.tierName}` : ""}`, body: lines.join("\n").trim() };
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  // "3,180 ₪" → 3180; text without digits ("לא ידוע") is unknown, not 0.
  const digits = v.replace(/[^\d.]/g, "");
  if (!/\d/.test(digits)) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isoDate = (v: unknown): string | null => {
  const s = str(v, 20);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) ?? s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (!m) return null;
  const [y, mo, d] = m[1].length === 4 ? [m[1], m[2], m[3]] : [m[3], m[2].padStart(2, "0"), m[1].padStart(2, "0")];
  return `${y}-${mo}-${d}`;
};

/** Whatever the AI returned → typed fields; anything unreadable becomes null, never a guess. */
export function normalizeQuoteFields(raw: unknown): QuoteFields {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    supplier_name: str(r.supplier_name, 120),
    model: str(r.model, 200),
    monthly_price: num(r.monthly_price),
    km_per_year: num(r.km_per_year) === null ? null : Math.round(num(r.km_per_year)!),
    period_months: num(r.period_months) === null ? null : Math.round(num(r.period_months)!),
    delivery_date: isoDate(r.delivery_date),
    includes: str(r.includes, 1000),
  };
}

const QUOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: QUOTE_FIELD_NAMES,
  properties: Object.fromEntries(QUOTE_FIELD_NAMES.map((f) => [f, { type: ["string", "number", "null"] }])),
};
const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subject", "body"],
  properties: { subject: { type: "string" }, body: { type: "string" } },
};

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...deps.cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "לא מחובר" }, 401);
  const user = await deps.getUser(auth);
  if (!user) return json({ error: "לא מחובר" }, 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;
  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  if (!requestId) return json({ error: "request_id חסר" }, 400);

  const db = deps.userClient(auth);
  const { data: request } = await db
    .from("vehicle_requests")
    .select("id, company_id, status, preferences, desired_date, period_months, employees(role, department), vehicle_tiers(name, monthly_cap, allowed_models), companies(name)")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return json({ error: "הבקשה לא נמצאה" }, 404);

  if (action === "draft") {
    const prefs = (request.preferences ?? {}) as Record<string, unknown>;
    const facts: QuoteFacts = {
      role: request.employees?.role ?? null,
      department: request.employees?.department ?? null,
      tierName: request.vehicle_tiers?.name ?? null,
      monthlyCap: num(request.vehicle_tiers?.monthly_cap),
      allowedModels: request.vehicle_tiers?.allowed_models ?? null,
      fuel: str(prefs.fuel),
      gearbox: str(prefs.gearbox),
      models: Array.isArray(prefs.models) ? prefs.models.map((m) => str(m)).filter((m): m is string => !!m) : [],
      notes: str(prefs.notes, 1000),
      desiredDate: request.desired_date ?? null,
      periodMonths: request.period_months ?? 36,
      companyName: request.companies?.name ?? null,
    };
    const template = buildQuoteRequestDraft(facts);
    try {
      const out = (await deps.aiJson({
        instructions:
          "נסח בעברית מייל קצר ומקצועי לחברת ליסינג שמבקש הצעת מחיר לרכב לפי הפרטים בטיוטה. " +
          "השתמש רק בפרטים שבטיוטה: אל תוסיף מחירים, דגמים, שמות או תאריכים שלא מופיעים בה, ואל תציין שם עובד. " +
          "החזר subject ו-body (טקסט רגיל, שורות מופרדות ב-\\n).\n\nהטיוטה:\n" + template.body,
        schema: DRAFT_SCHEMA,
      })) as { subject?: unknown; body?: unknown };
      const subject = str(out?.subject, 200);
      const text = str(out?.body, MAX_BODY);
      if (subject && text) return json({ subject, body: text, source: "ai" });
    } catch (e) {
      console.warn("draft AI failed, using the template", e);
    }
    return json({ ...template, source: "template" });
  }

  if (action === "send") {
    const supplierIds = Array.isArray(body?.supplier_ids) ? body.supplier_ids.filter((x): x is string => typeof x === "string") : [];
    const subject = str(body?.subject, 200);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (supplierIds.length === 0 || supplierIds.length > MAX_SUPPLIERS) return json({ error: "בחרו בין 1 ל-20 חברות ליסינג" }, 400);
    if (!subject || !text || text.length > MAX_BODY) return json({ error: "נושא ותוכן המייל חסרים או ארוכים מדי" }, 400);

    const { data: suppliers } = await db
      .from("suppliers")
      .select("id, name, email")
      .in("id", supplierIds)
      .eq("company_id", request.company_id)
      .eq("is_active", true);
    const recipients = ((suppliers ?? []) as Array<{ id: string; name: string; email: string | null }>).filter((s) => !!s.email);
    if (recipients.length === 0) return json({ error: "לחברות שנבחרו אין כתובת מייל" }, 400);

    // Record the request first, as the caller: RLS lets only fleet staff do it.
    const { data: updated, error: updateError } = await db
      .from("vehicle_requests")
      .update({
        status: request.status === "draft" ? "quotes_requested" : request.status,
        quote_subject: subject,
        quote_body: text,
        requested_supplier_ids: recipients.map((s) => s.id),
        quotes_requested_at: deps.now().toISOString(),
      })
      .eq("id", request.id)
      .select("id");
    if (updateError || !updated?.length) return json({ error: "אין הרשאה לשלוח בקשה זו" }, 403);

    const html = bodyToHtml(text);
    let sent = 0;
    const failed: string[] = [];
    for (const s of recipients) {
      const ok = await deps.sendEmail({
        to: s.email!, subject, html, label: "leasing-quote-request", replyTo: user.email ?? undefined,
        companyId: request.company_id,
        idempotencyKey: `leasing-quote-${request.id}-${s.id}-${deps.now().getTime()}`,
        metadata: { company_id: request.company_id, vehicle_request_id: request.id, supplier_id: s.id },
      });
      if (ok) sent++;
      else failed.push(s.name);
    }
    if (sent === 0) return json({ error: "שליחת המיילים נכשלה", failed }, 502);
    return json({ sent, failed });
  }

  if (action === "extract") {
    const path = typeof body?.path === "string" ? body.path : "";
    const prefix = `${request.company_id}/vehicle-quotes/${request.id}/`;
    const rest = path.slice(prefix.length);
    if (!path.startsWith(prefix) || !rest || rest.includes("/") || rest.includes("\\") || rest.startsWith(".")) {
      return json({ error: "נתיב קובץ לא תקין" }, 400);
    }
    const { data: file, error: downloadError } = await db.storage.from("asset-documents").download(path);
    if (downloadError || !file) return json({ error: "אין גישה לקובץ" }, 403);
    const mime = file.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    if (!/^(application\/pdf|image\/[a-z+.-]+)$/.test(mime)) return json({ error: "סוג קובץ לא נתמך" }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(bin);
    if (base64.length > MAX_FILE_BASE64) return json({ error: "הקובץ גדול מדי" }, 400);
    try {
      const raw = await deps.aiJson({
        instructions:
          "חלץ מהצעת המחיר של חברת הליסינג את השדות. monthly_price = מחיר חודשי בשקלים כמספר. " +
          "km_per_year = ק\"מ שנתי כלול. period_months = תקופה בחודשים. delivery_date בפורמט YYYY-MM-DD. " +
          "includes = מה כלול במחיר בקצרה. אם שדה לא מופיע בהצעה החזר null; אל תנחש.",
        fileDataUrl: `data:${mime};base64,${base64}`,
        mime,
        schema: QUOTE_SCHEMA,
      });
      return json({ fields: normalizeQuoteFields(raw) });
    } catch (e) {
      console.error("extract failed", e);
      return json({ error: "פענוח ההצעה נכשל. אפשר להקליד את הפרטים ידנית." }, 502);
    }
  }

  return json({ error: "פעולה לא מוכרת" }, 400);
}
