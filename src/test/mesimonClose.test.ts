import { describe, expect, it } from "vitest";
import { mesimonCloseRequest } from "../../supabase/functions/_shared/mesimon-close";

const ticket = { status: "done", ticket_code: "IT-0042", company_id: "c1", mesimon_task_id: "17" };

describe("mesimonCloseRequest — a ticket closed here closes its Mesimon task", () => {
  it("sends the ticket code and who closed it", () => {
    expect(mesimonCloseRequest(ticket, ["c1"], " נווה ")).toEqual({ body: { ticketCode: "IT-0042", closedBy: "נווה" } });
  });
  it("skips a ticket that was never sent to Mesimon", () => {
    expect(mesimonCloseRequest({ ...ticket, mesimon_task_id: null }, ["c1"], "")).toHaveProperty("skip");
  });
  it("skips a ticket that was reopened before the call ran", () => {
    expect(mesimonCloseRequest({ ...ticket, status: "in_progress" }, ["c1"], "")).toHaveProperty("skip");
  });
  it("skips another company's ticket", () => {
    expect(mesimonCloseRequest(ticket, ["other"], "")).toHaveProperty("skip");
  });
});
