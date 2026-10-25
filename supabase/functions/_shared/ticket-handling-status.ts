type HandlingAction = "mesimon" | "it" | "reply" | "done";

interface TicketStatusClient {
  from(table: "it_tickets"): {
    update(values: { status: "in_progress"; resolved_at: null; updated_at: string }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
      };
    };
  };
}

/** Call only after the transfer or note was saved successfully. Never reopen a closed ticket. */
export async function markTicketInProgress(client: TicketStatusClient, ticketId: string, action: HandlingAction) {
  if (action === "done") return;
  const { error } = await client.from("it_tickets")
    .update({ status: "in_progress", resolved_at: null, updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("status", "open");
  if (error) throw new Error(error.message);
}