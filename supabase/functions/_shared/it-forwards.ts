// A ticket's it_forwards log holds both IT sends and Mesimon transfers (target "mesimon").
// A ticket counts as sent to an IT person when at least one entry is not a Mesimon transfer.
export function forwardedToIt(forwards: unknown): boolean {
  return Array.isArray(forwards) && forwards.some((f: any) => f && typeof f === "object" && f.target !== "mesimon");
}
