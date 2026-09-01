import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_employees",
  title: "List employees",
  description:
    "List employees the signed-in user may see, optionally filtered by name/code search, status or department.",
  inputSchema: {
    search: z.string().optional().describe("Free text matched against full name or employee code."),
    status: z.enum(["active", "inactive", "offboarding"]).optional().describe("Employee status filter."),
    department: z.string().optional().describe("Exact department name."),
    limit: z.number().int().optional().describe("Max rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, department, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("employees")
      .select(
        "id, employee_code, full_name, email, phone, department, role, status, start_date, end_date, vacation_balance, sick_balance",
      )
      .order("full_name", { ascending: true })
      .limit(take);

    if (status) query = query.eq("status", status);
    if (department) query = query.eq("department", department);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(`full_name.ilike.${term},employee_code.ilike.${term},email.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, employees: data ?? [] });
  },
});
