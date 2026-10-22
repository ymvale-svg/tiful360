import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolContext } from "@lovable.dev/mcp-js";
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), abortSignal: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import { supabaseForUser } from "@/lib/mcp/supabase";
describe("MCP caller access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPABASE_URL", "https://example.invalid");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal });
    mocks.createClient.mockReturnValue({ rpc: mocks.rpc });
  });
  const authenticated = () => new ToolContext({
    type: "oauth", principal: { claims: { sub: "caller" }, issuer: "https://example.invalid", resource: "test", acceptedAudiences: ["authenticated"], scopes: [], sub: "caller" },
    bearer: { token: "test-only-token" },
  });
  it("rejects anonymous calls before creating a client", async () => {
    await expect(supabaseForUser(new ToolContext(undefined))).rejects.toThrow("נדרשת כניסה");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("uses only the caller bearer and disables session persistence", async () => {
    mocks.abortSignal.mockResolvedValue({ data: false, error: null });
    await supabaseForUser(authenticated());
    expect(mocks.createClient).toHaveBeenCalledWith("https://example.invalid", "sb_publishable_test", {
      global: { headers: { Authorization: "Bearer test-only-token" } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("my_access_blocked");
  });
  it("rejects blocked users", async () => {
    mocks.abortSignal.mockResolvedValue({ data: true, error: null });
    await expect(supabaseForUser(authenticated())).rejects.toThrow("אין הרשאת גישה");
  });
  it("fails closed when the access lookup fails", async () => {
    mocks.abortSignal.mockResolvedValue({ data: null, error: { message: "failed" } });
    await expect(supabaseForUser(authenticated())).rejects.toThrow("אין הרשאת גישה");
  });
});