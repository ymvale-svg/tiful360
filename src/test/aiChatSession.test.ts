import { beforeEach, describe, expect, it } from "vitest";
import { clearAiChats, INTERRUPTED_REPLY, loadAiChat, saveAiChat } from "@/lib/aiChatSession";

describe("AI chat survives a refresh", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores the open panel, messages, draft and pending action", () => {
    const snap = {
      open: true,
      messages: [{ role: "user" as const, content: "שלום" }, { role: "assistant" as const, content: "היי" }],
      input: "טיוטה",
      pending: { name: "create_it_ticket", args: { title: "מסך" } },
    };
    saveAiChat("u1", snap);
    expect(loadAiChat("u1")).toEqual(snap);
  });

  it("keeps each user's conversation separate", () => {
    saveAiChat("u1", { open: true, messages: [{ role: "user", content: "x" }], input: "", pending: null });
    expect(loadAiChat("u2")).toBeNull();
  });

  it("marks a reply lost to the refresh instead of waiting forever", () => {
    saveAiChat("u1", { open: true, messages: [{ role: "user", content: "שאלה" }], input: "", pending: null });
    expect(loadAiChat("u1")?.messages.at(-1)).toEqual({ role: "assistant", content: INTERRUPTED_REPLY });
  });

  it("drops everything on sign-out and ignores corrupt data", () => {
    saveAiChat("u1", { open: true, messages: [], input: "a", pending: null });
    sessionStorage.setItem("other", "keep");
    clearAiChats();
    expect(loadAiChat("u1")).toBeNull();
    expect(sessionStorage.getItem("other")).toBe("keep");
    sessionStorage.setItem("ai-chat:u3", "{not json");
    expect(loadAiChat("u3")).toBeNull();
  });
});
