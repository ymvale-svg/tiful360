import { describe, expect, it, vi } from "vitest";
import { markTicketInProgress } from "../../supabase/functions/_shared/ticket-handling-status";

function clientFor(status = "open", error: { message: string } | null = null) {
  const row = { id: "ticket-1", status, resolved_at: null };
  const filters: Record<string, string> = {};
  const update = vi.fn((values: Record<string, unknown>) => ({
    eq: (column: string, value: string) => {
      filters[column] = value;
      return { eq: async (column: string, value: string) => {
        filters[column] = value;
        if (!error && row.id === filters.id && row.status === filters.status) Object.assign(row, values);
        return { error };
      } };
    },
  }));
  return { row, client: { from: vi.fn(() => ({ update })) }, update };
}

describe("successful ticket handling", () => {
  it("marks a successful Mesimon transfer in progress", async () => {
    const { client, row } = clientFor();
    await markTicketInProgress(client, row.id, "mesimon");
    expect(row.status).toBe("in_progress");
  });
  it("marks a successful IT send in progress", async () => {
    const { client, row } = clientFor();
    await markTicketInProgress(client, row.id, "it");
    expect(row.status).toBe("in_progress");
  });
  it("marks a saved employee note in progress", async () => {
    const { client, row } = clientFor();
    await markTicketInProgress(client, row.id, "reply");
    expect(row.status).toBe("in_progress");
  });
  it.each(["mesimon", "it", "reply"] as const)("does not reopen a completed ticket after %s", async (action) => {
    const { client, row } = clientFor("done");
    await markTicketInProgress(client, row.id, action);
    expect(row.status).toBe("done");
  });
  it("does not turn a completion notice into active treatment", async () => {
    const { client, update } = clientFor();
    await markTicketInProgress(client, "ticket-1", "done");
    expect(update).not.toHaveBeenCalled();
  });
  it("reports a failed status save", async () => {
    const { client, row } = clientFor("open", { message: "save failed" });
    await expect(markTicketInProgress(client, row.id, "reply")).rejects.toThrow("save failed");
    expect(row.status).toBe("open");
  });
});