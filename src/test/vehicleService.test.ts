import { describe, expect, it, vi } from "vitest";
import { saveTier, sendQuoteRequest, updateVehicleRequest, uploadQuoteFile } from "@/services/vehicles";

type Db = Parameters<typeof saveTier>[0];

function fakeDb() {
  const calls: Array<[string, unknown[]]> = [];
  const chain: Record<string, unknown> = {};
  for (const m of ["insert", "update", "eq", "select", "single"]) chain[m] = (...a: unknown[]) => { calls.push([m, a]); return chain; };
  chain.then = (r: (v: unknown) => unknown) => r({ data: null, error: null });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const invoke = vi.fn().mockResolvedValue({ data: { sent: 2, failed: [] }, error: null });
  const db = { from: vi.fn(() => chain), storage: { from: vi.fn(() => ({ upload })) }, functions: { invoke } } as unknown as Db;
  return { db, calls, upload, invoke };
}

describe("vehicles service", () => {
  it("never writes the joined rows back with a tier or a request", async () => {
    const { db, calls } = fakeDb();
    await saveTier(db, "c1", { id: "t1", name: " רמה 2 ", vehicle_tier_roles: [{ id: "x", role_name: "r", department: null }] });
    await updateVehicleRequest(db, "v1", { status: "chosen", employees: { full_name: "x", role: null, department: null, start_date: null }, vehicle_quotes: [] });
    const updates = calls.filter(([m]) => m === "update").map(([, a]) => a[0]);
    expect(updates).toEqual([{ name: "רמה 2" }, { status: "chosen" }]);
  });

  it("stores quote files in the request's folder with a safe name", async () => {
    const { db, upload } = fakeDb();
    const file = new File(["%PDF"], "../הצעה ליסינג א.pdf", { type: "application/pdf" });
    const path = await uploadQuoteFile(db, { id: "v1", company_id: "c1" }, file);
    expect(path).toMatch(/^c1\/vehicle-quotes\/v1\/\d+-_הצעה_ליסינג_א\.pdf$/);
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: "application/pdf", upsert: false });
  });

  it("sends through the leasing-quotes function", async () => {
    const { db, invoke } = fakeDb();
    await expect(sendQuoteRequest(db, "v1", ["s1"], "נושא", "גוף")).resolves.toEqual({ sent: 2, failed: [] });
    expect(invoke).toHaveBeenCalledWith("leasing-quotes", { body: { action: "send", request_id: "v1", supplier_ids: ["s1"], subject: "נושא", body: "גוף" } });
  });
});
