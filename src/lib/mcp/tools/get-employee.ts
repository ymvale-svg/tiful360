import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_employee",
  title: "Get employee details",
  description:
    "Fetch one employee card with the assets currently assigned to them. Accepts an employee id or employee code.",
  inputSchema: {
    employee_id: z.string().optional().describe("Employee UUID."),
    employee_code: z.string().optional().describe("Employee code, e.g. EMP-1042."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ employee_id, employee_code }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    if (!employee_id && !employee_code) return errorResult("יש לספק employee_id או employee_code");

    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("employees")
      .select(
        "id, employee_code, full_name, email, phone, department, role, status, start_date, end_date, direct_manager_id, vacation_balance, sick_balance, tracks_attendance, can_remote_punch",
      )
      .limit(1);
    query = employee_id ? query.eq("id", employee_id) : query.eq("employee_code", employee_code!);

    const { data, error } = await query.maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("העובד לא נמצא או שאין הרשאה לצפות בו");

    const { data: assets } = await supabase
      .from("assets")
      .select("id, asset_code, asset_name, status, condition, license_plate, serial_number, account_username")
      .eq("current_owner_id", data.id);

    return jsonResult({ employee: data, assigned_assets: assets ?? [] });
  },
});
