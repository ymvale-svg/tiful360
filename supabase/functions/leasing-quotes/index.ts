// Wiring for the leasing quotes handler (logic and tests: handler.ts).
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY;
// optional LOVABLE_AI_MODEL for the structured calls.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendHtmlEmailLogged } from "../_shared/send-email-logged.ts";
import { handle, type Deps } from "./handler.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_KEY = Deno.env.get("LOVABLE_API_KEY");
const AI_MODEL = Deno.env.get("LOVABLE_AI_MODEL")?.trim() || "openai/gpt-6-astra";

/** The platform's AI gateway, responses API with a JSON schema (same call as extract-insurance-policy). */
async function aiJson({ instructions, fileDataUrl, mime, schema }: Parameters<Deps["aiJson"]>[0]): Promise<unknown> {
  if (!AI_KEY) throw new Error("LOVABLE_API_KEY missing");
  const content: unknown[] = [{ type: "input_text", text: instructions }];
  if (fileDataUrl) {
    content.push(mime === "application/pdf"
      ? { type: "input_file", filename: "quote.pdf", file_data: fileDataUrl }
      : { type: "input_image", image_url: fileDataUrl });
  }
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": AI_KEY, Authorization: `Bearer ${AI_KEY}`, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: AI_MODEL,
      store: false,
      reasoning: { effort: "low" },
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text: string = data.output_text
    ?? (data.output ?? []).flatMap((o: { content?: Array<{ text?: string }> }) => o.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  return JSON.parse(text);
}

const service = createClient(URL_, SERVICE);

const deps: Deps = {
  cors: corsHeaders,
  getUser: async (auth) => {
    const { data } = await createClient(URL_, ANON, { global: { headers: { Authorization: auth } } }).auth.getUser();
    return data?.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  },
  userClient: (auth) => createClient(URL_, ANON, { global: { headers: { Authorization: auth } } }),
  aiJson,
  sendEmail: (args) => sendHtmlEmailLogged(service, args),
  now: () => new Date(),
};

Deno.serve((req) => handle(req, deps));
