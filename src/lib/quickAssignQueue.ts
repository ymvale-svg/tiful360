/**
 * Quick-assign queue helpers. HandoverFlow calls onAssigned() and then close(),
 * so the dialog's onOpenChange(false) right after a successful assign must not
 * abort the batch.
 */
export type QueueStep = { next: number | null; done: boolean };

/** Advance the queue after an item was assigned. */
export function advanceQueue(index: number | null, total: number): QueueStep {
  if (index === null) return { next: null, done: false };
  const next = index + 1;
  if (next >= total) return { next: null, done: true };
  return { next, done: false };
}

/**
 * Decide what a HandoverFlow close means: after a successful assign it is just
 * the flow closing itself (keep the queue); otherwise the user cancelled.
 */
export function closeFollowsAssign(justAssigned: boolean): "ignore" | "abort" {
  return justAssigned ? "ignore" : "abort";
}
