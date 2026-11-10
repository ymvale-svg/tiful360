import { describe, expect, it, vi } from "vitest";
import { handle, type Deps } from "../../supabase/functions/ingest-access-tree/handler";

const SYSTEM = "00000000-0000-4000-8000-0000000005a1";
const call = (body: unknown, token = "key") =>
  new Request("https://x/ingest-access-tree", {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const deps = (ingest: Deps["ingest"] = vi.fn().mockResolvedValue({ added: 1 })): Deps => ({ cors: {}, ingest });

describe("ingest-access-tree", () => {
  it("passes the key, system, paths and agent to the DB check and returns its result", async () => {
    const ingest = vi.fn<Deps["ingest"]>().mockResolvedValue({ added: 2, missing: 0 });
    const res = await handle(call({ system_id: SYSTEM, paths: ["a", "a\\b"], agent: "FILESRV01" }), deps(ingest));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: { added: 2, missing: 0 } });
    expect(ingest).toHaveBeenCalledWith({ systemId: SYSTEM, token: "key", paths: ["a", "a\\b"], agent: "FILESRV01" });
  });

  it("refuses a missing or wrong key without detail", async () => {
    expect((await handle(call({ system_id: SYSTEM, paths: ["a"] }, ""), deps())).status).toBe(401);
    const wrong = vi.fn<Deps["ingest"]>().mockRejectedValue(new Error("invalid scan key"));
    const res = await handle(call({ system_id: SYSTEM, paths: ["a"] }), deps(wrong));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects bad input before touching the DB, including an empty scan", async () => {
    const ingest = vi.fn<Deps["ingest"]>();
    for (const [body, status] of [
      [{ system_id: "nope", paths: ["a"] }, 400],
      [{ system_id: SYSTEM }, 400],
      [{ system_id: SYSTEM, paths: [] }, 400],
      [{ system_id: SYSTEM, paths: ["a", 5] }, 400],
      [{ system_id: SYSTEM, paths: ["x".repeat(1001)] }, 400],
      [{ system_id: SYSTEM, paths: Array.from({ length: 20001 }, (_, i) => `p${i}`) }, 413],
    ] as const) {
      expect((await handle(call(body), deps(ingest))).status, JSON.stringify(body).slice(0, 60)).toBe(status);
    }
    expect(ingest).not.toHaveBeenCalled();
  });

  it("answers preflight and only POST", async () => {
    expect((await handle(new Request("https://x", { method: "OPTIONS" }), deps())).status).toBe(200);
    expect((await handle(new Request("https://x", { method: "GET" }), deps())).status).toBe(405);
  });
});
