import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FIELDS = ["insurance_company", "policy_number", "coverage_type", "coverage_amount", "premium", "start_date", "end_date", "agent_name", "agent_phone", "agent_email"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY חסר" }, 500);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "לא מחובר" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await supabase.auth.getUser();
    if (!u?.user) return json({ error: "לא מחובר" }, 401);

    const body = await req.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path : "";
    if (!path || path.length > 500) return json({ error: "נתיב קובץ לא תקין" }, 400);

    // RLS on storage enforces company access
    const { data: file, error: dErr } = await supabase.storage.from("asset-documents").download(path);
    if (dErr || !file) return json({ error: "אין גישה לקובץ" }, 403);
    const mime = file.type || (path.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const dataUrl = `data:${mime};base64,${btoa(bin)}`;
    const part = mime === "application/pdf"
      ? { type: "input_file", filename: "policy.pdf", file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl };

    const props: Record<string, unknown> = {};
    FIELDS.forEach((f) => (props[f] = { type: ["string", "null"] }));

    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "חלץ מפוליסת הביטוח את השדות. תאריכים בפורמט YYYY-MM-DD. סכומים כמספר בלבד ללא סימני מטבע. coverage_type = סוג הכיסוי/הביטוח. premium = פרמיה שנתית. אם שדה לא מופיע החזר null." },
            part,
          ],
        }],
        text: { format: { type: "json_schema", name: "policy", strict: true, schema: { type: "object", properties: props, required: FIELDS, additionalProperties: false } } },
      }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text();
      console.error("AI failed", res.status, t);
      const msg = res.status === 402 ? "נגמרו הקרדיטים ל-AI" : res.status === 429 ? "עומס, נסה שוב בעוד רגע" : "פענוח הקובץ נכשל";
      return json({ error: msg, details: t }, res.status);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", out = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(l.slice(5).trim());
          if (ev.type === "response.output_text.delta") out += ev.delta;
        } catch { /* ignore */ }
      }
    }
    if (!out) return json({ error: "לא ניתן לפענח את הקובץ" }, 422);
    return json({ fields: JSON.parse(out) });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
