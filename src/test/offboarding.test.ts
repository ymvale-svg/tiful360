import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: (options: unknown) => options,
}));
import { useStartOffboarding } from "@/hooks/useOffboarding";

const params = { employeeId: "employee-1", employeeName: "שפרה", employeeCode: "EMP-376", endDate: "2026-10-30", digitalAccess: [], assets: [] };
const mutation = () => useStartOffboarding() as unknown as { mutationFn: (p: typeof params) => Promise<unknown> };

describe("offboarding transaction", () => {
  beforeEach(() => { vi.clearAllMocks(); invoke.mockResolvedValue({ error: null }); });
  it("passes only the employee and date, never a caller-supplied actor", async () => {
    rpc.mockResolvedValue({ data: { ticketCode: "IT-003", ticketId: "ticket-1" }, error: null });
    await expect(mutation().mutationFn(params)).resolves.toEqual({ ticketCode: "IT-003" });
    expect(rpc).toHaveBeenCalledWith("start_employee_offboarding", { _employee_id: "employee-1", _end_date: "2026-10-30" });
  });
  it("does not notify or report success when the transaction fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(mutation().mutationFn(params)).rejects.toThrow("denied");
    expect(invoke).not.toHaveBeenCalled();
  });
});