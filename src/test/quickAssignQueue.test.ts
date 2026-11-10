import { describe, expect, it } from "vitest";
import { advanceQueue, closeFollowsAssign } from "@/lib/quickAssignQueue";

describe("quick-assign queue", () => {
  it("advances through every item", () => {
    expect(advanceQueue(0, 3)).toEqual({ next: 1, done: false });
    expect(advanceQueue(1, 3)).toEqual({ next: 2, done: false });
    expect(advanceQueue(2, 3)).toEqual({ next: null, done: true });
  });
  it("finishes a single-item queue", () => expect(advanceQueue(0, 1)).toEqual({ next: null, done: true }));
  it("ignores advance when no queue is running", () => expect(advanceQueue(null, 2)).toEqual({ next: null, done: false }));
  it("keeps the queue when the flow closes right after an assign", () => expect(closeFollowsAssign(true)).toBe("ignore"));
  it("aborts the batch when the user closes the flow", () => expect(closeFollowsAssign(false)).toBe("abort"));
});
