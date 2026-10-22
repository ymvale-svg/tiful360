import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "get_service_ticket", title: "פרטי קריאת שירות",
  description: "Read an accessible service ticket and its IT-forwarded flag; does not expose attachments, payroll or recipient addresses.",
  inputSchema: { ticket_id: z.string().uuid().describe("Ticket ID returned by list_service_tickets.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ ticket_id }, ctx) => {
    const client = await supabaseForUser(ctx);
    const { data, error } = await client.from("it_tickets").select("id, ticket_code, title, description, status, priority, company_id, created_at, it_forwards")
      .eq("id", ticket_id).abortSignal(ctx.signal).maybeSingle();
    if (error || !data) throw new ToolError("הקריאה לא נמצאה או שאין הרשאה לצפות בה");
    const ticket = { id: data.id, ticket_code: data.ticket_code, title: data.title, description: data.description, status: data.status, priority: data.priority, company_id: data.company_id, created_at: data.created_at, forwarded_to_it: Array.isArray(data.it_forwards) && data.it_forwards.length > 0 };
    return { content: [{ type: "text", text: JSON.stringify(ticket) }], structuredContent: { ticket } };
  },
});