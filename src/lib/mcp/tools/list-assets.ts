import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { errorResult, jsonResult, notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_assets",
  title: "List assets",
  description:
    "List company resources (equipment, vehicles, digital access, licenses) with optional search, status filter and assignment filter.",
  inputSchema: {
    search: z.string().optional().describe("Free text matched against asset name, code, serial number or license plate."),
    status: z.string().optional().describe("Asset status value, e.g. available, assigned, maintenance."),
    unassigned_only: z.boolean().optional().describe("Return only assets with no current owner."),
    owner_employee_id: z.string().optional().describe("Return only assets held by this employee UUID."),
    limit: z.number().int().optional().describe("Max rows to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, unassigned_only, owner_employee_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const take = Math.min(Math.max(limit ?? 25, 1), 100);
    let query = supabaseForUser(ctx)
      .from("assets")
      .select(
        "id, asset_code, asset_name, status, condition, category_id, current_owner_id, manufacturer_model, serial_number, license_plate, account_username, expiry_date, notes",
      )
      .order("asset_name", { ascending: true })
      .limit(take);

    if (status) query = query.eq("status", status as never);
    if (unassigned_only) query = query.is("current_owner_id", null);
    if (owner_employee_id) query = query.eq("current_owner_id", owner_employee_id);
    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `asset_name.ilike.${term},asset_code.ilike.${term},serial_number.ilike.${term},license_plate.ilike.${term}`,
      );
    }

    const { data, error } = await query;
    if (error) return errorResult(error.message);
    return jsonResult({ count: data?.length ?? 0, assets: data ?? [] });
  },
});
