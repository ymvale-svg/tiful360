import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
export default defineTool({
  name: "list_service_tickets", title: "רשימת קריאות שירות",
  description: "List a bounded page of service tickets for an accessible company, respecting the caller's existing permissions.",
  inputSchema: {
    company_id: z.string().uuid().describe("Company ID returned by list_companies."),
    status: z.enum(["open_all", "open", "in_progress", "done", "all"]).default("open_all").describe("Ticket status filter; open_all excludes closed tickets."),
    limit: z.number().int().min(1).max(50).default(25).describe("Maximum number of tickets."),
    offset: z.number().int().min(0).max(10000).default(0).describe("Pagination offset."),
  }, annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id, status, limit, offset }, ctx) => {
    const client = await supabaseForUser(ctx);
    let query = client.from("it_tickets").select("id, ticket_code, title, status, priority, created_at, company_id")
      .eq("company_id", company_id).order("created_at", { ascending: false }).order("id").range(offset, offset + limit - 1);
    if (status === "open_all") query = query.neq("status", "done");
    else if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.abortSignal(ctx.signal);
    if (error) throw new ToolError("לא ניתן לקרוא את הקריאות");
    const tickets = (data ?? []).map((row) => ({ id: row.id, ticket_code: row.ticket_code, title: row.title, status: row.status, priority: row.priority, company_id: row.company_id, created_at: row.created_at }));
    return { content: [{ type: "text", text: JSON.stringify(tickets) }], structuredContent: { tickets } };
  },
});