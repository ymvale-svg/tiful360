// A ticket closed in Tiful360 closes the Mesimon task made from it. Decides whether
// to tell Mesimon, and what to send. Mesimon closes the task without sending the
// close back, and a task that is already closed there stays as it is.
export type ClosableTicket = {
  status: string;
  ticket_code: string;
  company_id: string;
  mesimon_task_id: string | null;
};

export function mesimonCloseRequest(
  t: ClosableTicket,
  companies: string[],
  closedBy: string,
): { skip: string } | { body: { ticketCode: string; closedBy: string } } {
  if (!t.mesimon_task_id) return { skip: "the ticket was not sent to Mesimon" };
  if (t.status !== "done") return { skip: "the ticket was reopened" };
  if (!companies.includes(t.company_id)) return { skip: "the company is not connected to Mesimon" };
  return { body: { ticketCode: t.ticket_code, closedBy: closedBy.trim().slice(0, 200) } };
}
