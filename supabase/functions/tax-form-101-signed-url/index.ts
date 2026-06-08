import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== 'string' || token.length > 200) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: rows, error } = await admin.rpc('get_tax_form_101_by_token', { _token: token });
    if (error) throw error;
    const form: any = Array.isArray(rows) ? rows[0] : rows;
    if (!form?.pdf_url) {
      return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const marker = '/tax-forms-101/';
    const idx = String(form.pdf_url).indexOf(marker);
    const path = idx >= 0 ? String(form.pdf_url).slice(idx + marker.length) : String(form.pdf_url);

    const { data: signed, error: e2 } = await admin.storage
      .from('tax-forms-101')
      .createSignedUrl(path, 300);
    if (e2) throw e2;

    return new Response(JSON.stringify({ signedUrl: signed.signedUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('tax-form-101-signed-url error:', e);
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
