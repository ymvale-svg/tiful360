// Data access for vehicles and leasing. Functions take the client as a parameter so they can be
// tested with a fake. company_id of tier roles and quotes is set by DB triggers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Supplier, VehicleQuote, VehicleRequest, VehicleTier } from "@/domain/vehicles/types";
import type { QuoteFields } from "../../supabase/functions/leasing-quotes/handler";

// The vehicle tables are newer than the generated types: queried untyped, typed by the row interfaces.
type Db = Pick<SupabaseClient, "from" | "functions" | "storage">;

const fail = (error: unknown) => {
  if (error) throw error;
};

export async function listSuppliers(db: Db, companyId: string): Promise<Supplier[]> {
  const { data, error } = await db.from("suppliers").select("*").eq("company_id", companyId).order("name");
  fail(error);
  return (data ?? []) as Supplier[];
}

export async function saveSupplier(db: Db, companyId: string, s: Partial<Supplier> & Pick<Supplier, "name">) {
  const { id, ...fields } = s;
  const payload = { ...fields, name: fields.name.trim(), email: fields.email?.trim() || null };
  const { error } = id
    ? await db.from("suppliers").update(payload).eq("id", id).eq("company_id", companyId)
    : await db.from("suppliers").insert({ ...payload, company_id: companyId });
  fail(error);
}

export async function listTiers(db: Db, companyId: string): Promise<VehicleTier[]> {
  const { data, error } = await db
    .from("vehicle_tiers")
    .select("*, vehicle_tier_roles(id, role_name, department)")
    .eq("company_id", companyId)
    .order("level");
  fail(error);
  return (data ?? []) as VehicleTier[];
}

export async function saveTier(db: Db, companyId: string, t: Partial<VehicleTier> & Pick<VehicleTier, "name">) {
  const { id, vehicle_tier_roles: _roles, ...fields } = t;
  const payload = { ...fields, name: fields.name.trim() };
  const { error } = id
    ? await db.from("vehicle_tiers").update(payload).eq("id", id).eq("company_id", companyId)
    : await db.from("vehicle_tiers").insert({ ...payload, company_id: companyId });
  fail(error);
}

export async function addTierRole(db: Db, tierId: string, roleName: string, department?: string | null) {
  const { error } = await db
    .from("vehicle_tier_roles")
    .insert({ tier_id: tierId, role_name: roleName.trim(), department: department?.trim() || null });
  fail(error);
}

export async function removeTierRole(db: Db, id: string) {
  const { error } = await db.from("vehicle_tier_roles").delete().eq("id", id);
  fail(error);
}

const REQUEST_SELECT =
  "*, employees(full_name, role, department, start_date), vehicle_tiers(name, monthly_cap, allowed_models), vehicle_quotes(*, suppliers(name))";

export async function listVehicleRequests(db: Db, companyId: string): Promise<VehicleRequest[]> {
  const { data, error } = await db
    .from("vehicle_requests")
    .select(REQUEST_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(200);
  fail(error);
  return (data ?? []) as VehicleRequest[];
}

export async function getVehicleRequestForItem(db: Db, onboardingItemId: string): Promise<VehicleRequest | null> {
  const { data, error } = await db
    .from("vehicle_requests")
    .select(REQUEST_SELECT)
    .eq("onboarding_item_id", onboardingItemId)
    .neq("status", "cancelled")
    .maybeSingle();
  fail(error);
  return (data ?? null) as VehicleRequest | null;
}

export async function createVehicleRequest(
  db: Db,
  r: Pick<VehicleRequest, "company_id" | "employee_id"> & Partial<Pick<VehicleRequest, "onboarding_item_id" | "tier_id" | "preferences" | "desired_date" | "period_months">>,
): Promise<VehicleRequest> {
  const { data, error } = await db.from("vehicle_requests").insert(r).select(REQUEST_SELECT).single();
  fail(error);
  return data as VehicleRequest;
}

export async function updateVehicleRequest(db: Db, id: string, patch: Partial<VehicleRequest>) {
  const { employees: _e, vehicle_tiers: _t, vehicle_quotes: _q, ...fields } = patch;
  const { error } = await db.from("vehicle_requests").update(fields).eq("id", id);
  fail(error);
}

export async function saveQuote(db: Db, q: Partial<VehicleQuote> & Pick<VehicleQuote, "request_id">) {
  const { id, suppliers: _s, ...fields } = q;
  const { error } = id
    ? await db.from("vehicle_quotes").update(fields).eq("id", id)
    : await db.from("vehicle_quotes").insert(fields);
  fail(error);
}

export async function deleteQuote(db: Db, id: string) {
  const { error } = await db.from("vehicle_quotes").delete().eq("id", id);
  fail(error);
}

/** Store a quote file where leasing-quotes may read it: <company>/vehicle-quotes/<request>/<file>. */
export async function uploadQuoteFile(db: Db, request: Pick<VehicleRequest, "id" | "company_id">, file: File): Promise<string> {
  const safe = file.name.replace(/[^\w.֐-׿-]+/g, "_").replace(/^\.+/, "") || "quote.pdf";
  const path = `${request.company_id}/vehicle-quotes/${request.id}/${Date.now()}-${safe}`;
  const { error } = await db.storage.from("asset-documents").upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
  fail(error);
  return path;
}

type LeasingAction =
  | { action: "draft"; request_id: string }
  | { action: "send"; request_id: string; supplier_ids: string[]; subject: string; body: string }
  | { action: "extract"; request_id: string; path: string };

async function callLeasing<T>(db: Db, body: LeasingAction): Promise<T> {
  const { data, error } = await db.functions.invoke("leasing-quotes", { body });
  if (error) {
    // The function answers errors as {error}; surface that message.
    const context = (error as { context?: Response }).context;
    const message = context ? await context.json().then((b: { error?: string }) => b.error).catch(() => null) : null;
    throw new Error(message || error.message);
  }
  return data as T;
}

export const draftQuoteRequest = (db: Db, requestId: string) =>
  callLeasing<{ subject: string; body: string; source: "ai" | "template" }>(db, { action: "draft", request_id: requestId });

export const sendQuoteRequest = (db: Db, requestId: string, supplierIds: string[], subject: string, body: string) =>
  callLeasing<{ sent: number; failed: string[] }>(db, { action: "send", request_id: requestId, supplier_ids: supplierIds, subject, body });

export const extractQuote = (db: Db, requestId: string, path: string) =>
  callLeasing<{ fields: QuoteFields }>(db, { action: "extract", request_id: requestId, path });
