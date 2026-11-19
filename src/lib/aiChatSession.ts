/**
 * Keeps the AI assistant conversation alive across a page refresh.
 * Stored in sessionStorage (this tab only, gone when the tab closes), keyed per
 * signed-in user so another account in the same tab never sees it, and cleared on sign-out.
 */
export type AiChatMsg = { role: "user" | "assistant"; content: string };
export type AiChatPending = { name: string; args: Record<string, unknown> } | null;

export interface AiChatSnapshot {
  open: boolean;
  messages: AiChatMsg[];
  input: string;
  pending: AiChatPending;
}

const PREFIX = "ai-chat:";
export const INTERRUPTED_REPLY = "התשובה לא התקבלה כי הדף רוענן. אפשר לשלוח את השאלה שוב.";

const keyFor = (userId: string) => `${PREFIX}${userId}`;

function isMsg(m: unknown): m is AiChatMsg {
  return !!m && typeof m === "object"
    && ((m as AiChatMsg).role === "user" || (m as AiChatMsg).role === "assistant")
    && typeof (m as AiChatMsg).content === "string";
}

export function loadAiChat(userId: string | null | undefined): AiChatSnapshot | null {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AiChatSnapshot>;
    const messages = Array.isArray(data.messages) ? data.messages.filter(isMsg) : [];
    const pending = data.pending && typeof data.pending === "object" && typeof data.pending.name === "string"
      ? { name: data.pending.name, args: data.pending.args ?? {} }
      : null;
    // A refresh while waiting for a reply drops that request: say so instead of hanging silently.
    if (!pending && messages.length > 0 && messages[messages.length - 1].role === "user") {
      messages.push({ role: "assistant", content: INTERRUPTED_REPLY });
    }
    return {
      open: data.open === true,
      messages,
      input: typeof data.input === "string" ? data.input : "",
      pending,
    };
  } catch {
    return null;
  }
}

export function saveAiChat(userId: string | null | undefined, snap: AiChatSnapshot) {
  if (!userId) return;
  try {
    const empty = !snap.open && snap.messages.length === 0 && !snap.input && !snap.pending;
    if (empty) sessionStorage.removeItem(keyFor(userId));
    else sessionStorage.setItem(keyFor(userId), JSON.stringify(snap));
  } catch {
    /* storage full or blocked: the chat still works, it just won't survive a refresh */
  }
}

export function clearAiChats() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}
