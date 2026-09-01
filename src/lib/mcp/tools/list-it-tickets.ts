import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_it_tickets",
  title: "List IT tickets",
  description: "List IT/operations tickets, optionally filtered by status, priority or employee.",
  inputSchema: {
    status: z.string().optional().describe("Ticket status, e.g. open, in_progress, resolved."),
    priority: z.string().optional().describe("Ticket priority, e.g. low, medium, high, urgent."),
    employee_id: z.string().optional().describe("Filter by requesting employee UUID."),
    limit: z.number().int().optional().describe("Max rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, priority, employee_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("it_tickets")
      .select("id, ticket_code, title, ticket_type, status, priority, employee_id, assigned_to, sla_deadline, created_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(take);

    if (status) query = query.eq("status", status as never);
    if (priority) query = query.eq("priority", priority as never);
    if (employee_id) query = query.eq("employee_id", employee_id);

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, tickets: data ?? [] });
  },
});
