// External API for the tenant's own app / site: one address, one key, every screen.
// Auth: Authorization: Bearer <api_key> (key stored hashed in public.api_keys).
//
// The key only decides *whether* a call is allowed (scopes + granted companies).
// What the caller actually sees is decided by the row-level-security rules of the
// key's owner account, because every query runs with that account's own session.
// A key can therefore never out-grow the person who created it.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import {
  RESOURCES,
  filterableColumns,
  publicRow,
  scopeForAction,
  type ApiAction,
  type ResourceDef,
  type Scope,
} from "../_shared/openApiResources.ts";
import { searchOrFilter } from "../_shared/openApiSearch.ts";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;
const MAX_DELETE = 100;
const RATE_LIMIT_PER_MIN = 120;
const ACTIONS: ApiAction[] = ["list", "get", "create", "update", "delete", "preview_delete", "capabilities"];
const FILTER_OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"];

const SCOPE_HE: Record<Scope, string> = {
  read: "קריאה",
  write: "הוספה ועריכה",
  delete: "מחיקה",
  payroll: "שכר",
};

/** A failure whose message is already meant for a human, in Hebrew. */
class ApiError extends Error {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isUuid = (v: unknown) =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ── per-key rate limit (best effort, inside this instance) ───────────────────
const hits = new Map<string, number[]>();
function rateLimited(keyId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(keyId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MIN) {
    hits.set(keyId, recent);
    return true;
  }
  recent.push(now);
  hits.set(keyId, recent);
  return false;
}

// ── the owner's own session, so row-level security does the deciding ─────────
const sessions = new Map<string, { token: string; until: number }>();

async function ownerSession(ownerId: string): Promise<string> {
  const cached = sessions.get(ownerId);
  if (cached && cached.until > Date.now()) return cached.token;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: usr, error: userErr } = await admin.auth.admin.getUserById(ownerId);
  const email = usr?.user?.email;
  if (userErr || !email) {
    throw new ApiError("לחשבון של בעל המפתח אין כתובת דוא\"ל, ולכן המפתח לא יכול לפעול.");
  }

  // generateLink's declared type omits hashed_token even though the server sends it
  // (it arrives under `properties`).
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = (link as unknown as Record<string, any> | null)?.properties?.hashed_token;
  if (linkErr || typeof tokenHash !== "string" || !tokenHash) {
    throw new ApiError("לא ניתן לפתוח חשבון פעולה עבור בעל המפתח. נסו שוב או החליפו את בעל המפתח.");
  }

  const { data: verified, error: verifyErr } = await admin.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  const token = verified?.session?.access_token;
  if (verifyErr || !token) {
    throw new ApiError("החשבון של בעל המפתח לא מאושר, ולכן המפתח לא יכול לפעול.");
  }

  sessions.set(ownerId, { token, until: Date.now() + 4 * 60_000 });
  return token;
}

// ── request pieces ───────────────────────────────────────────────────────────
function readFilters(body: Record<string, unknown>, def: ResourceDef) {
  const raw = body.filters;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ApiError("filters חייב להיות רשימה של {column, op, value}.");
  const allowed = new Set(filterableColumns(def));
  return raw.map((entry) => {
    const f = (entry ?? {}) as Record<string, unknown>;
    const column = String(f.column ?? "");
    const op = String(f.op ?? "eq");
    if (!allowed.has(column)) {
      throw new ApiError(`אי אפשר לסנן את ${def.label} לפי "${column}".`);
    }
    if (!FILTER_OPS.includes(op)) {
      throw new ApiError(`הסימן "${op}" לא נתמך. נתמך: ${FILTER_OPS.join(", ")}.`);
    }
    return { column, op, value: f.value };
  });
}

function readWritable(body: Record<string, unknown>, def: ResourceDef): Record<string, unknown> {
  const raw = body.data;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ApiError("חסר data: רשומה עם הערכים לשינוי.");
  }
  const allowed = new Set(def.writable ?? []);
  const out: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (allowed.has(k)) out[k] = v;
    else rejected.push(k);
  }
  if (rejected.length) {
    throw new ApiError(
      `השדות האלה לא ניתנים לשינוי דרך הממשק: ${rejected.join(", ")}. מותר: ${(def.writable ?? []).join(", ")}.`,
    );
  }
  if (!Object.keys(out).length) throw new ApiError("data ריק — אין מה לשמור.");
  return out;
}

function readIds(body: Record<string, unknown>, def: ResourceDef): string[] {
  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError("יש למסור ids: רשימת מזהים מדויקת. אין מחיקה של 'הכול'.");
  }
  if (raw.length > (def.maxDelete ?? MAX_DELETE)) {
    throw new ApiError(`אפשר למחוק עד ${def.maxDelete ?? MAX_DELETE} רשומות בקריאה אחת.`);
  }
  if (!raw.every(isUuid)) throw new ApiError("כל המזהים ב-ids חייבים להיות מזהים תקינים.");
  return raw as string[];
}

// ── the call ─────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const key = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let apiKey: Record<string, any> | null = null;
  const log: Record<string, unknown> = {
    resource: "-",
    action: "-",
    status: "ok",
    ip: req.headers.get("x-forwarded-for") ?? null,
  };

  try {
    if (!key) throw new ApiError("חסר מפתח API. שלחו כותרת Authorization: Bearer <המפתח שלכם>.");

    const { data: found } = await admin
      .from("api_keys")
      .select("id, company_id, owner_user_id, scopes, expires_at, is_active, key_prefix, name")
      .eq("key_hash", await sha256(key))
      .maybeSingle();
    if (!found) throw new ApiError("מפתח API לא תקין.");
    apiKey = found as Record<string, any>;
    log.api_key_id = apiKey.id;
    log.key_prefix = apiKey.key_prefix;
    log.owner_user_id = apiKey.owner_user_id;

    if (!apiKey.is_active) throw new ApiError("המפתח הזה כבוי. יש להפעיל אותו מחדש במסך ניהול המפתחות.");
    if (apiKey.expires_at && new Date(apiKey.expires_at).getTime() < Date.now()) {
      throw new ApiError("תוקף המפתח הזה פג.");
    }
    if (!apiKey.owner_user_id) {
      throw new ApiError("למפתח הזה אין בעל חשבון, ולכן הוא לא עובד בממשק הפתוח. יש להגדיר לו בעל במסך ניהול המפתחות.");
    }
    if (rateLimited(String(apiKey.id))) {
      throw new ApiError("יותר מדי קריאות בדקה מהמפתח הזה. נסו שוב בעוד רגע.");
    }

    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", apiKey.id);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "") as ApiAction;
    const resource = String(body.resource ?? "");
    log.action = action;
    log.resource = resource;

    if (!ACTIONS.includes(action)) {
      throw new ApiError(`הפעולה "${action}" לא מוכרת. נתמך: ${ACTIONS.join(", ")}.`);
    }

    // What this key may do, without touching any tenant data.
    if (action === "capabilities") {
      const { data: grants } = await admin
        .from("api_key_companies")
        .select("company_id")
        .eq("api_key_id", apiKey.id);
      const companies = new Set<string>((grants ?? []).map((g: any) => g.company_id));
      if (apiKey.company_id) companies.add(apiKey.company_id);
      const { data: names } = await admin.from("companies").select("id, name").in("id", [...companies]);
      return json({
        ok: true,
        key_name: apiKey.name,
        scopes: apiKey.scopes,
        companies: names ?? [],
        resources: Object.entries(RESOURCES).map(([name, def]) => ({
          resource: name,
          label: def.label,
          actions: def.actions,
          payroll: !!def.payroll,
          writable: def.writable ?? [],
        })),
      });
    }

    const def = RESOURCES[resource];
    if (!def) {
      throw new ApiError(`החלק "${resource}" אינו מוכר. זמינים: ${Object.keys(RESOURCES).join(", ")}.`);
    }
    if (!def.actions.includes(action)) {
      throw new ApiError(`הפעולה "${action}" לא נתמכת ב${def.label}. נתמך: ${def.actions.join(", ")}.`);
    }

    const need = scopeForAction(action);
    if (!(apiKey.scopes ?? []).includes(need)) {
      throw new ApiError(`למפתח הזה אין הרשאת "${SCOPE_HE[need]}". יש להוסיף אותה במסך ניהול המפתחות.`);
    }
    if (def.payroll && !(apiKey.scopes ?? []).includes("payroll")) {
      throw new ApiError(`${def.label} מיועד למפתחות עם הרשאת "שכר".`);
    }

    const companyId = String(body.company_id ?? "");
    if (!isUuid(companyId)) throw new ApiError("חסר company_id תקין.");
    const { data: grantRow } = await admin
      .from("api_key_companies")
      .select("company_id")
      .eq("api_key_id", apiKey.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!grantRow && companyId !== apiKey.company_id) {
      throw new ApiError("המפתח הזה לא מורשה לעבוד מול החברה הזו.");
    }
    log.company_id = companyId;

    const token = await ownerSession(String(apiKey.owner_user_id));
    const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_PAGE) || DEFAULT_PAGE, 1), MAX_PAGE);
      const offset = Math.min(Math.max(Number(body.offset ?? 0) || 0, 0), 10_000);
      let q = user.from(def.table).select(def.select ?? "*", { count: "exact" }).eq(def.company, companyId);
      for (const f of readFilters(body, def)) {
        const col = f.column;
        const val = f.value;
        switch (f.op) {
          case "eq": q = q.eq(col, val); break;
          case "neq": q = q.neq(col, val); break;
          case "gt": q = q.gt(col, val); break;
          case "gte": q = q.gte(col, val); break;
          case "lt": q = q.lt(col, val); break;
          case "lte": q = q.lte(col, val); break;
          case "like": q = q.like(col, String(val)); break;
          case "ilike": q = q.ilike(col, String(val)); break;
          case "in": q = q.in(col, Array.isArray(val) ? val : [val]); break;
          case "is": q = q.is(col, val); break;
        }
      }
      const search = typeof body.search === "string" ? body.search.trim() : "";
      if (search) {
        const cols = def.search ?? [];
        if (!cols.length) throw new ApiError(`ב${def.label} לא אפשרי חיפוש חופשי.`);
        q = q.or(searchOrFilter(cols, search));
      }
      const orderCol = typeof body.order_by === "string" && filterableColumns(def).includes(body.order_by)
        ? body.order_by
        : def.order;
      if (orderCol) q = q.order(orderCol, { ascending: body.order_dir === "asc" });
      const { data, error, count } = await q.range(offset, offset + limit - 1);
      if (error) throw new ApiError(`הקריאה נכשלה: ${error.message}`);
      const listed = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => publicRow(def, r));
      // Which records were read, not only that the resource was read (תקנות אבטחת מידע, תיעוד גישה).
      const readIds = listed.map((r) => String(r.id ?? "")).filter(Boolean);
      log.record_id = readIds.join(",");
      // record_id is cut to 500 characters (about 13 ids); the full list goes to requested_ids (jsonb).
      log.requested_ids = readIds;
      return json({ ok: true, resource, count: count ?? listed.length, offset, limit, rows: listed });
    }

    if (action === "get") {
      const id = String(body.id ?? "");
      if (!isUuid(id)) throw new ApiError("חסר id תקין.");
      const { data, error } = await user
        .from(def.table)
        .select(def.select ?? "*")
        .eq(def.company, companyId)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new ApiError(`הקריאה נכשלה: ${error.message}`);
      if (!data) throw new ApiError("הרשומה לא נמצאה בחברה הזו.");
      log.record_id = id;
      return json({ ok: true, resource, row: publicRow(def, data as unknown as Record<string, unknown>) });
    }

    if (action === "create") {
      const data = readWritable(body, def);
      const { data: rows, error } = await user
        .from(def.table)
        .insert({ ...data, [def.company]: companyId })
        .select(def.select ?? "*");
      if (error) throw new ApiError(`השמירה נכשלה: ${error.message}`);
      log.record_id = String((rows as unknown as Array<Record<string, unknown>> | null)?.[0]?.id ?? "");
      return json({ ok: true, resource, row: publicRow(def, (rows as unknown as Array<Record<string, unknown>> | null)?.[0] ?? null) });
    }

    if (action === "update") {
      const id = String(body.id ?? "");
      if (!isUuid(id)) throw new ApiError("חסר id תקין.");
      const data = readWritable(body, def);
      const { data: rows, error } = await user
        .from(def.table)
        .update(data)
        .eq(def.company, companyId)
        .eq("id", id)
        .select(def.select ?? "*");
      if (error) throw new ApiError(`העדכון נכשל: ${error.message}`);
      if (!rows?.length) throw new ApiError("הרשומה לא נמצאה בחברה הזו, ואף רשומה לא השתנתה.");
      log.record_id = id;
      return json({ ok: true, resource, row: publicRow(def, rows[0] as unknown as Record<string, unknown>) });
    }

    // delete + preview_delete both work on an explicit id list only.
    const ids = readIds(body, def);
    log.requested_ids = ids;
    const { data: rows, error } = await user
      .from(def.table)
      .select(def.select ?? "*")
      .eq(def.company, companyId)
      .in("id", ids);
    if (error) throw new ApiError(`הקריאה נכשלה: ${error.message}`);
    const matched = (rows ?? []) as unknown as Array<Record<string, unknown>>;

    if (action === "preview_delete") {
      return json({
        ok: true,
        resource,
        would_delete: matched.length,
        missing_ids: ids.filter((i) => !matched.some((r) => String(r.id) === i)),
        rows: matched.map((r) => publicRow(def, r)),
      });
    }

    if (matched.length !== ids.length) {
      throw new ApiError(
        `רק ${matched.length} מתוך ${ids.length} מהמזהים נמצאו בחברה הזו. אף רשומה לא נמחקה.`,
      );
    }
    const { error: delErr } = await user.from(def.table).delete().eq(def.company, companyId).in("id", ids);
    if (delErr) throw new ApiError(`המחיקה נכשלה: ${delErr.message}`);
    log.record_id = ids.join(",");
    return json({ ok: true, resource, deleted: matched.length });
  } catch (e) {
    const message = e instanceof ApiError ? e.message : "שגיאה בלתי צפויה. נסו שוב או פנו לתמיכה.";
    log.status = "error";
    log.error = message;
    return json({ ok: false, error: message }, e instanceof ApiError ? statusOf(message) : 500);
  } finally {
    // Every call is recorded, successful or not. The log table cannot be edited.
    await admin.from("api_request_log").insert({
      api_key_id: apiKey?.id ?? null,
      key_prefix: apiKey?.key_prefix ?? null,
      owner_user_id: apiKey?.owner_user_id ?? null,
      company_id: log.company_id ?? null,
      resource: String(log.resource ?? "-"),
      action: String(log.action ?? "-"),
      record_id: log.record_id ? String(log.record_id).slice(0, 500) : null,
      requested_ids: log.requested_ids ?? null,
      status: String(log.status ?? "error"),
      error: log.error ? String(log.error).slice(0, 500) : null,
      ip: log.ip ?? null,
    });
  }
});

/** Human messages map to the status a caller should react to. */
function statusOf(message: string): number {
  if (message.includes("לא תקין") || message.startsWith("חסר מפתח")) return 401;
  if (message.includes("אין הרשאה") || message.includes("אין הרשאת") || message.includes("לא מורשה")
    || message.includes("כבוי") || message.includes("תוקף") || message.includes("בעל חשבון")
    || message.includes("הרשאת \"שכר\"")) return 403;
  if (message.includes("יותר מדי קריאות")) return 429;
  if (message.includes("לא נמצא") || message.includes("לא השתנתה")) return 404;
  return 400;
}
