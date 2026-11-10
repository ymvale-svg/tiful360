import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bodyToHtml,
  buildQuoteRequestDraft,
  handle,
  normalizeQuoteFields,
  type Deps,
} from "../../supabase/functions/leasing-quotes/handler";

const REQUEST = {
  id: "req-1", company_id: "c1", status: "draft",
  preferences: { fuel: "היברידי", models: ["טויוטה קורולה"], notes: "וו גרירה" },
  desired_date: "2026-11-16", period_months: 36,
  employees: { role: "מהנדס ביצוע", department: "הנדסה" },
  vehicle_tiers: { name: "רמה 2", monthly_cap: 3500, allowed_models: null },
  companies: { name: "חברה לדוגמה" },
};

/** A fake caller client: one row per table, and a record of writes. */
function makeDb(opts: { request?: unknown; suppliers?: unknown[]; updateRows?: number; file?: { type: string; bytes: Uint8Array } | null } = {}) {
  const writes: Array<{ table: string; values: unknown }> = [];
  const filters: Array<[string, unknown]> = [];
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let update: unknown = null;
      const pass = (name: string) => (chain[name] = (...args: unknown[]) => { if (name === "eq" || name === "in") filters.push([String(args[0]), args[1]]); return chain; });
      ["select", "eq", "in"].forEach(pass);
      chain.update = (values: unknown) => { update = values; writes.push({ table, values }); return chain; };
      chain.maybeSingle = async () => ({ data: table === "vehicle_requests" ? (opts.request === undefined ? REQUEST : opts.request) : null });
      chain.then = (resolve: (v: unknown) => unknown) => {
        if (table === "suppliers") return resolve({ data: opts.suppliers ?? [] });
        if (update) return resolve({ data: Array.from({ length: opts.updateRows ?? 1 }, () => ({ id: "req-1" })), error: null });
        return resolve({ data: null });
      };
      return chain;
    },
    storage: {
      from: () => ({
        download: async () => opts.file === null || opts.file === undefined
          ? { data: null, error: { message: "denied" } }
          : { data: { type: opts.file.type, arrayBuffer: async () => opts.file!.bytes.buffer }, error: null },
      }),
    },
  };
  return { db, writes, filters };
}

let deps: Deps;
let sendEmail: ReturnType<typeof vi.fn<Deps["sendEmail"]>>;
let aiJson: ReturnType<typeof vi.fn<Deps["aiJson"]>>;
const post = (body: unknown, auth = "Bearer token") =>
  new Request("https://x/leasing-quotes", { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

function setup(dbOpts: Parameters<typeof makeDb>[0] = {}) {
  const made = makeDb(dbOpts);
  sendEmail = vi.fn<Deps["sendEmail"]>().mockResolvedValue(true);
  aiJson = vi.fn<Deps["aiJson"]>();
  deps = {
    cors: { "Access-Control-Allow-Origin": "*" },
    getUser: async () => ({ id: "u1", email: "fleet@example.com" }),
    userClient: () => made.db,
    aiJson,
    sendEmail,
    now: () => new Date("2026-11-10T10:00:00Z"),
  };
  return made;
}

describe("leasing quotes: basics", () => {
  beforeEach(() => setup());

  it("answers CORS preflight and refuses callers who are not signed in", async () => {
    expect((await handle(new Request("https://x", { method: "OPTIONS" }), deps)).status).toBe(200);
    expect((await handle(post({ action: "draft", request_id: "req-1" }, ""), deps)).status).toBe(401);
    deps.getUser = async () => null;
    expect((await handle(post({ action: "draft", request_id: "req-1" }), deps)).status).toBe(401);
  });

  it("404s a request the caller cannot see (RLS) and 400s an unknown action", async () => {
    setup({ request: null });
    expect((await handle(post({ action: "draft", request_id: "other" }), deps)).status).toBe(404);
    setup();
    expect((await handle(post({ action: "delete", request_id: "req-1" }), deps)).status).toBe(400);
  });
});

describe("draft", () => {
  it("uses the AI wording when it comes back complete", async () => {
    setup();
    aiJson.mockResolvedValue({ subject: "בקשת הצעה", body: "שלום,\nנבקש הצעה." });
    const res = await (await handle(post({ action: "draft", request_id: "req-1" }), deps)).json();
    expect(res).toEqual({ subject: "בקשת הצעה", body: "שלום,\nנבקש הצעה.", source: "ai" });
    expect(aiJson.mock.calls[0][0].instructions).toContain("אל תציין שם עובד");
  });

  it("falls back to the template when AI fails, without the employee's name", async () => {
    setup();
    aiJson.mockRejectedValue(new Error("402"));
    const res = await (await handle(post({ action: "draft", request_id: "req-1" }), deps)).json();
    expect(res.source).toBe("template");
    expect(res.body).toContain("מהנדס ביצוע");
    expect(res.body).toContain("רמה 2");
    expect(res.body).toContain("טויוטה קורולה");
    expect(res.body).toContain("16/11/2026");
  });
});

describe("send", () => {
  const suppliers = [
    { id: "s1", name: "ליסינג א", email: "a@leasing.example" },
    { id: "s2", name: "ליסינג ב", email: null },
  ];

  it("records the request as the caller, then emails each supplier with the company brand and a reply-to", async () => {
    const { writes } = setup({ suppliers });
    const res = await handle(post({ action: "send", request_id: "req-1", supplier_ids: ["s1", "s2"], subject: "בקשה", body: "שלום\n\n<b>x</b>" }), deps);
    expect(await res.json()).toEqual({ sent: 1, failed: [] });
    expect(writes[0]).toMatchObject({ table: "vehicle_requests", values: { status: "quotes_requested", requested_supplier_ids: ["s1"], quote_subject: "בקשה" } });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: "a@leasing.example", replyTo: "fleet@example.com", companyId: "c1", label: "leasing-quote-request" });
    expect(sendEmail.mock.calls[0][0].html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("sends nothing when RLS refuses the update", async () => {
    setup({ suppliers, updateRows: 0 });
    const res = await handle(post({ action: "send", request_id: "req-1", supplier_ids: ["s1"], subject: "בקשה", body: "שלום" }), deps);
    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("validates suppliers, subject and body", async () => {
    setup({ suppliers: [{ id: "s2", name: "ליסינג ב", email: null }] });
    expect((await handle(post({ action: "send", request_id: "req-1", supplier_ids: [], subject: "a", body: "b" }), deps)).status).toBe(400);
    expect((await handle(post({ action: "send", request_id: "req-1", supplier_ids: ["s1"], subject: "", body: "b" }), deps)).status).toBe(400);
    expect((await handle(post({ action: "send", request_id: "req-1", supplier_ids: ["s2"], subject: "a", body: "b" }), deps)).status).toBe(400);
  });
});

describe("extract", () => {
  const file = { type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 quote") };

  it("accepts only a file in this request's quote folder", async () => {
    setup({ file });
    for (const path of ["c2/vehicle-quotes/req-1/a.pdf", "c1/vehicle-quotes/req-1/../x.pdf", "c1/vehicle-quotes/req-1/", "c1/vehicle-quotes/req-1/.hidden"]) {
      expect((await handle(post({ action: "extract", request_id: "req-1", path }), deps)).status, path).toBe(400);
    }
  });

  it("returns normalized fields from the AI and never a guess", async () => {
    setup({ file });
    aiJson.mockResolvedValue({ supplier_name: "ליסינג א", model: "קורולה", monthly_price: "3,180 ₪", km_per_year: "20000", period_months: 36, delivery_date: "1/12/2026", includes: null });
    const res = await (await handle(post({ action: "extract", request_id: "req-1", path: "c1/vehicle-quotes/req-1/quote.pdf" }), deps)).json();
    expect(res.fields).toEqual({ supplier_name: "ליסינג א", model: "קורולה", monthly_price: 3180, km_per_year: 20000, period_months: 36, delivery_date: "2026-12-01", includes: null });
    expect(aiJson.mock.calls[0][0].fileDataUrl).toMatch(/^data:application\/pdf;base64,/);
  });

  it("403s a file the caller cannot download", async () => {
    setup({ file: null });
    expect((await handle(post({ action: "extract", request_id: "req-1", path: "c1/vehicle-quotes/req-1/q.pdf" }), deps)).status).toBe(403);
  });
});

describe("pure helpers", () => {
  it("normalizes junk to nulls", () => {
    expect(normalizeQuoteFields({ monthly_price: "לא ידוע", delivery_date: "בקרוב", model: "  " })).toEqual({
      supplier_name: null, model: null, monthly_price: null, km_per_year: null, period_months: null, delivery_date: null, includes: null,
    });
    expect(normalizeQuoteFields(null).model).toBeNull();
  });

  it("keeps paragraphs and escapes HTML in the email", () => {
    expect(bodyToHtml("א\nב\n\n<ג>")).toBe('<div dir="rtl" style="direction:rtl;text-align:right;"><p>א<br>ב</p><p>&lt;ג&gt;</p></div>');
  });

  it("builds a draft without a tier or preferences", () => {
    const d = buildQuoteRequestDraft({ role: null, department: null, tierName: null, monthlyCap: null, allowedModels: null, fuel: null, gearbox: null, models: [], notes: null, desiredDate: null, periodMonths: 24, companyName: null });
    expect(d.subject).toBe("בקשת הצעת מחיר לרכב ליסינג");
    expect(d.body).toContain("24 חודשים");
  });
});
