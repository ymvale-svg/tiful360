import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_leave_requests",
  title: "List leave and sickness requests",
  description:
    "List leave, sickness and reserve-duty requests, optionally filtered by employee, status, type or date range.",
  inputSchema: {
    employee_id: z.string().optional().describe("Filter by employee UUID."),
    status: z.string().optional().describe("Request status, e.g. approved, pending, rejected."),
    request_type: z.string().optional().describe("Request type, e.g. vacation, sick, reserve."),
    from_date: z.string().optional().describe("Only requests starting on or after this ISO date (YYYY-MM-DD)."),
    to_date: z.string().optional().describe("Only requests starting on or before this ISO date (YYYY-MM-DD)."),
    limit: z.number().int().optional().describe("Max rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ employee_id, status, request_type, from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("leave_requests")
      .select(
        "id, employee_id, request_type, status, start_date, end_date, total_days, reason, manager_note, created_at",
      )
      .order("start_date", { ascending: false })
      .limit(take);

    if (employee_id) query = query.eq("employee_id", employee_id);
    if (status) query = query.eq("status", status as never);
    if (request_type) query = query.eq("request_type", request_type as never);
    if (from_date) query = query.gte("start_date", from_date);
    if (to_date) query = query.lte("start_date", to_date);

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, requests: data ?? [] });
  },
});
