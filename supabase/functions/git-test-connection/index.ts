import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const USERNAME = Deno.env.get('GIT_API_USERNAME') ?? '';
const PASSWORD = Deno.env.get('GIT_API_PASSWORD') ?? '';
const BASE_URL_RAW = Deno.env.get('GIT_API_BASE_URL') ?? '';

interface AttemptResult {
  url: string;
  method: string;
  auth: string;
  status: number | string;
  contentType?: string;
  bodyPreview?: string;
  ok: boolean;
}

async function tryRequest(url: string, method: string, authMode: 'basic' | 'none', body?: unknown): Promise<AttemptResult> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (body) headers['Content-Type'] = 'application/json';
  if (authMode === 'basic') {
    headers['Authorization'] = 'Basic ' + btoa(`${USERNAME}:${PASSWORD}`);
  }
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const ct = res.headers.get('content-type') ?? '';
    const text = await res.text();
    // Shape only — never the upstream body. Enough to tell "correct base URL,
    // wrong credentials" from "hit the HTML portal instead of the API".
    const shape = ct.includes('json') ? 'json' : ct.includes('html') ? 'html' : 'other';
    return {
      url,
      method,
      auth: authMode,
      status: res.status,
      contentType: ct,
      bodyPreview: `${shape}, ${text.length} bytes`,
      ok: res.ok,
    };
  } catch (e) {
    return {
      url, method, auth: authMode,
      status: 'NETWORK_ERROR',
      bodyPreview: (e as Error).message,
      ok: false,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Diagnostic endpoint: it probes an internal API with the organisation's
  // Basic credentials and reports what came back. Any authenticated user used
  // to reach it, which made it a credential-disclosing proxy for every
  // employee. Restricted to super_admin, and it no longer echoes the
  // username or upstream response bodies.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const authClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: roleRows } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  ).from('user_roles').select('role').eq('user_id', user.id);
  if (!(roleRows ?? []).some((r: { role: string }) => r.role === 'super_admin')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!USERNAME || !PASSWORD) {
    return new Response(JSON.stringify({ error: 'Missing GIT_API_USERNAME / GIT_API_PASSWORD' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Build candidate base URLs from what user provided
  const raw = BASE_URL_RAW.trim().replace(/\/+$/, '');
  const origin = (() => { try { return new URL(raw).origin; } catch { return ''; } })();

  const candidates = Array.from(new Set([
    raw,
    origin && `${origin}/api/v1`,
    origin && `${origin}/api`,
    origin,
    'https://a.gold.org.il/api/v1',
    'https://a.gold.org.il/api',
    'https://api.gold.org.il/v1',
    'https://api.gold.org.il',
  ].filter(Boolean))) as string[];

  const probePaths = [
    '/servicecalls?limit=1',
    '/servicecall-types',
    '/sites',
    '/',
  ];

  const attempts: AttemptResult[] = [];

  for (const base of candidates) {
    for (const path of probePaths) {
      const url = base + path;
      const r = await tryRequest(url, 'GET', 'basic');
      attempts.push(r);
      if (r.ok && (r.contentType?.includes('json'))) {
        // Found working endpoint — stop early
        return new Response(JSON.stringify({
          success: true,
          working_endpoint: { base, path, full_url: url },
          all_attempts: attempts,
        }, null, 2), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  return new Response(JSON.stringify({
    success: false,
    message: 'No working endpoint found. Review attempts to identify correct base URL.',
    note: 'A 401 with JSON content-type usually means base URL is correct but auth/credentials are wrong. 404 means wrong path. HTML response means hitting the web portal, not the API.',
    base_url_provided: BASE_URL_RAW,
    attempts,
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
