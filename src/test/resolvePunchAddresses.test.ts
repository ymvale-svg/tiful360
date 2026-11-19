import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompanyId: null }) }));

import { canAutoResolve, resolvePunchAddresses } from "@/hooks/useAttendanceLocationReport";

describe("resolvePunchAddresses", () => {
  beforeEach(() => {
    invoke.mockReset();
    localStorage.clear();
  });

  it("never sends the same punches twice while a run is in progress", async () => {
    let release!: () => void;
    invoke.mockImplementation(
      () => new Promise((r) => { release = () => r({ data: { resolved: 2, remaining: 0 }, error: null }); }),
    );
    const first = resolvePunchAddresses(["a", "b"]);
    const second = await resolvePunchAddresses(["a", "b"]);
    expect(second).toEqual({ done: 0, failed: 0, reason: null });
    release();
    await first;
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("pauses automatic runs after a failure and explains a blocked service", async () => {
    invoke.mockResolvedValue({ data: { resolved: 0, remaining: 3, errors: ["photon_429"] }, error: null });
    const res = await resolvePunchAddresses(["x", "y", "z"]);
    expect(res.failed).toBe(1);
    expect(res.reason).toContain("חסם");
    expect(canAutoResolve()).toBe(false);
  });

  it("clears the pause after a successful run", async () => {
    localStorage.setItem("attendance-geo-resolve-failed-at", String(Date.now()));
    invoke.mockResolvedValue({ data: { resolved: 1, remaining: 0 }, error: null });
    const onChunk = vi.fn();
    const res = await resolvePunchAddresses(["q"], onChunk);
    expect(res).toEqual({ done: 1, failed: 0, reason: null });
    expect(onChunk).toHaveBeenCalled();
    expect(canAutoResolve()).toBe(true);
  });
});
