// Resolves the street address of attendance punches from their GPS point and stores
// it on attendance_punches.geo_address.
//
// Authorization: the caller's JWT runs get_punches_missing_address, which returns
// only punches the caller may see (their own, or employees visible in attendance
// reports). Only those rows are written, with the service role.
//
// Addresses come from Photon (photon.komoot.io), the free OpenStreetMap geocoder that
// answers our server's requests. Points are snapped to a grid of
// 0.0005° (about 55 m × 47 m in Israel) and cached in geo_address_cache, so GPS jitter
// around the same site resolves to one lookup and each place is looked up once.
// One call resolves at most MAX_LOOKUPS new places; the client calls again for the rest.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_IDS = 50;
const MAX_LOOKUPS = 20;
const PHOTON_URL = "https://photon.komoot.io/reverse";
const USER_AGENT = "Tiful360-Attendance/1.0";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// 0.0005° grid; the snapped value fits geo_address_cache's numeric(8,4) keys.
const roundKey = (n: number) => Math.round(n * 2000) / 2000;

interface PhotonProperties {
  street?: string;
  housenumber?: string;
  name?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
}

/** "רחוב 4, ירושלים" from Photon's reverse-geocode feature. */
function formatAddress(features: { properties?: PhotonProperties }[]): string {
  const p = features[0]?.properties ?? {};
  const streetPart = p.street ? [p.street, p.housenumber].filter(Boolean).join(" ") : (p.name ?? p.locality ?? p.district);
  const city = p.city ?? p.locality ?? p.district ?? p.county;
  return [streetPart, city].filter(Boolean).join(", ");
}

async function lookup(lat: number, lng: number): Promise<string> {
  // Photon answers 400 when any extra query parameter is sent, so the URL stays lat/lon only.
  const url = `${PHOTON_URL}?lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) throw new Error(`photon_${res.status}`);
  const body = await res.json();
  const features = (Array.isArray(body?.features) ? body.features : []) as { properties?: PhotonProperties }[];
  return formatAddress(features);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  try {
    const body = await req.json().catch(() => null) as { punch_ids?: unknown } | null;
    const ids = Array.isArray(body?.punch_ids)
      ? (body!.punch_ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_IDS)
      : [];
    if (ids.length === 0) return json({ resolved: 0, remaining: 0 });

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: pending, error: pendErr } = await userClient.rpc("get_punches_missing_address", { _punch_ids: ids });
    if (pendErr) return json({ error: "lookup_failed" }, 403);
    const rows = (pending ?? []) as { punch_id: string; lat: number; lng: number }[];
    if (rows.length === 0) return json({ resolved: 0, remaining: 0 });

    // Group punches by rounded point.
    const byKey = new Map<string, { lat: number; lng: number; punchIds: string[] }>();
    for (const r of rows) {
      const lat = roundKey(r.lat);
      const lng = roundKey(r.lng);
      const k = `${lat},${lng}`;
      const g = byKey.get(k) ?? { lat, lng, punchIds: [] };
      g.punchIds.push(r.punch_id);
      byKey.set(k, g);
    }
    const groups = [...byKey.values()];

    // Cached places.
    const { data: cached } = await admin
      .from("geo_address_cache")
      .select("lat_key, lng_key, address")
      .in("lat_key", [...new Set(groups.map((g) => g.lat))])
      .in("lng_key", [...new Set(groups.map((g) => g.lng))]);
    const cache = new Map<string, string>();
    for (const c of cached ?? []) cache.set(`${Number(c.lat_key)},${Number(c.lng_key)}`, c.address);

    let lookups = 0;
    let resolved = 0;
    let remaining = 0;
    for (const g of groups) {
      const k = `${g.lat},${g.lng}`;
      let address = cache.get(k);
      if (address === undefined) {
        if (lookups >= MAX_LOOKUPS) {
          remaining += g.punchIds.length;
          continue;
        }
        if (lookups > 0) await sleep(1100);
        lookups++;
        try {
          address = await lookup(g.lat, g.lng);
        } catch (e) {
          console.error("geocode lookup failed", String(e));
          remaining += g.punchIds.length;
          continue;
        }
        await admin.from("geo_address_cache").upsert({ lat_key: g.lat, lng_key: g.lng, address });
      }
      const { error: updErr } = await admin
        .from("attendance_punches")
        .update({ geo_address: address })
        .in("id", g.punchIds)
        .is("geo_address", null);
      if (updErr) {
        console.error("update failed", updErr.message);
        remaining += g.punchIds.length;
      } else {
        resolved += g.punchIds.length;
      }
    }

    return json({ resolved, remaining });
  } catch (e) {
    console.error("unhandled", e);
    return json({ error: "internal_error" }, 500);
  }
});
