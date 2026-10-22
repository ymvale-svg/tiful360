import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_companies", title: "החברות הזמינות לי",
  description: "List up to 100 companies the signed-in user may access, with IDs for subsequent ticket queries.",
  inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    const client = await supabaseForUser(ctx);
    const { data, error } = await client.from("companies").select("id, name").order("name").limit(100).abortSignal(ctx.signal);
    if (error) throw new ToolError("לא ניתן לקרוא את החברות");
    return { content: [{ type: "text", text: JSON.stringify(data ?? []) }], structuredContent: { companies: (data ?? []).map((row) => ({ id: row.id, name: row.name })) } };
  },
});