// The office agent's folder scan: POST {system_id, paths, agent} with "Authorization: Bearer
// <scan key>". The key is checked in the DB against the system's hashed key
// (ingest_system_access_tree), so a key opens exactly one system. Pure: index.ts wires the DB.

export interface Deps {
  cors: Record<string, string>;
  /** ingest_system_access_tree as the service role; throws the DB error. */
  ingest(args: { systemId: string; token: string; paths: string[]; agent: string | null }): Promise<unknown>;
}

const MAX_PATHS = 20000;
const MAX_PATH_LENGTH = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...deps.cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: deps.cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as { system_id?: unknown; paths?: unknown; agent?: unknown } | null;
  const systemId = typeof body?.system_id === "string" ? body.system_id : "";
  if (!UUID.test(systemId)) return json({ error: "invalid_system_id" }, 400);
  if (!Array.isArray(body?.paths)) return json({ error: "paths_required" }, 400);
  const paths = body.paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0 && p.length <= MAX_PATH_LENGTH);
  if (paths.length !== body.paths.length) return json({ error: "invalid_path" }, 400);
  // An empty scan would flag every folder as missing: almost always a broken share, not a wiped drive.
  if (paths.length === 0) return json({ error: "empty_scan" }, 400);
  if (paths.length > MAX_PATHS) return json({ error: "too_many_paths" }, 413);
  const agent = typeof body?.agent === "string" ? body.agent.slice(0, 80) : null;

  try {
    const result = await deps.ingest({ systemId, token, paths, agent });
    return json({ ok: true, result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("invalid scan key")) return json({ error: "unauthorized" }, 401);
    console.error("ingest-access-tree failed", message);
    return json({ error: "ingest_failed" }, 500);
  }
}
