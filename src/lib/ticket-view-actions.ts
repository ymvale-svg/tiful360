export const ticketFilters = ["open_all", "open", "in_progress", "done", "all"] as const;
export function validateTicketFilter(value: unknown): string {
  if (typeof value !== "string" || !ticketFilters.some((filter) => filter === value)) throw new Error("מסנן לא תקין");
  return value;
}
export function visibleTicketId(value: unknown, tickets: readonly { id: string }[]): string {
  if (typeof value !== "string" || !tickets.some((ticket) => ticket.id === value)) throw new Error("הקריאה אינה מוצגת ברשימה הנוכחית");
  return value;
}