import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  sign_token: string;
  form_type: "handover" | "offboarding";
  kind: "attachment" | "pdf";
  filename?: string;
  content_type?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = (await req.json()) as Body;
    if (!body?.sign_token || !body?.form_type || !body?.kind) {
      return json({ error: "missing_fields" }, 400);
    }
    if (!["handover", "offboarding"].includes(body.form_type)) return json({ error: "bad_form_type" }, 400);
    if (!["attachment", "pdf"].includes(body.kind)) return json({ error: "bad_kind" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Look up form by token
    const table = body.form_type === "handover" ? "asset_handover_forms" : "offboarding_forms";
    const { data: form, error: lookupErr } = await admin
      .from(table)
      .select("id, company_id, employee_id, status" + (body.form_type === "handover" ? ", asset_id" : ""))
      .eq("sign_token", body.sign_token)
      .maybeSingle();

    if (lookupErr) return json({ error: "lookup_failed", details: lookupErr.message }, 500);
    if (!form) return json({ error: "invalid_token" }, 401);
    if (form.status !== "pending") return json({ error: "form_already_processed" }, 409);

    // Build a constrained path the client cannot influence
    const safeExt = (body.filename ?? "").split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || (body.kind === "pdf" ? "pdf" : "bin");
    const ts = Date.now();
    let path: string;
    if (body.form_type === "handover") {
      const assetId = (form as any).asset_id;
      path = body.kind === "pdf"
        ? `${form.company_id}/${form.employee_id}/${assetId}-${ts}.pdf`
        : `${form.company_id}/${form.employee_id}/${assetId}-attached-${ts}.${safeExt}`;
    } else {
      path = body.kind === "pdf"
        ? `offboarding/${form.company_id}/${form.employee_id}/${form.id}-${ts}.pdf`
        : `offboarding/${form.company_id}/${form.employee_id}/${form.id}-attached-${ts}.${safeExt}`;
    }

    const { data: signed, error: signErr } = await admin.storage
      .from("handover-forms")
      .createSignedUploadUrl(path);

    if (signErr || !signed) return json({ error: "sign_failed", details: signErr?.message }, 500);

    const { data: pub } = admin.storage.from("handover-forms").getPublicUrl(path);

    return json({
      path,
      token: signed.token,
      signed_url: signed.signedUrl,
      public_url: pub.publicUrl,
    });
  } catch (e) {
    console.error("unhandled", e);
    return json({ error: "internal_error", details: String(e) }, 500);
  }
});

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
