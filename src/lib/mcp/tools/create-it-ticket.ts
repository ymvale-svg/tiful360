import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_it_ticket",
  title: "Create IT ticket",
  description: "Open a new IT/operations ticket for an employee in תפעול 360.",
  inputSchema: {
    employee_id: z.string().describe("UUID of the employee the ticket is opened for."),
    title: z.string().describe("Short ticket title in Hebrew or English."),
    ticket_type: z.string().optional().describe("Ticket type, e.g. hardware, software, access."),
    priority: z.string().optional().describe("Priority: low, medium, high or urgent. Defaults to medium."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ employee_id, title, ticket_type, priority }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const trimmed = title.trim();
    if (!trimmed) return errorResult("כותרת הקריאה נדרשת");

    const supabase = supabaseForUser(ctx);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, company_id")
      .eq("id", employee_id)
      .maybeSingle();
    if (employeeError) return errorResult(employeeError.message);
    if (!employee) return errorResult("העובד לא נמצא או שאין הרשאה");

    const { data, error } = await supabase
      .from("it_tickets")
      .insert({
        employee_id: employee.id,
        company_id: employee.company_id,
        title: trimmed,
        ticket_code: `MCP-${Date.now().toString(36).toUpperCase()}`,
        ...(ticket_type ? { ticket_type: ticket_type as never } : {}),
        ...(priority ? { priority: priority as never } : {}),
      })
      .select("id, ticket_code, title, status, priority, created_at")
      .single();

    if (error) return errorResult(error.message);
    return jsonResult({ ticket: data });
  },
});
