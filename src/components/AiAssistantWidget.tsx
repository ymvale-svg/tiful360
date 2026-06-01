import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Check, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { name: string; args: Record<string, any> } | null;

const ACTION_LABELS: Record<string, string> = {
  create_employee: "יצירת עובד חדש",
  create_it_ticket: "פתיחת פניית IT",
  approve_leave_request: "עדכון סטטוס בקשת חופשה",
  close_it_ticket: "סגירת פניית IT",
};

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const { selectedCompanyId } = useCompany() as any;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, pending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function callAssistant(history: Msg[], approvedAction: PendingAction = null) {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { messages: history, companyId: selectedCompanyId ?? null, approvedAction },
      });
      if (error) throw error;
      if (data?.type === "needs_approval") {
        if (data.preface) setMessages((m) => [...m, { role: "assistant", content: data.preface }]);
        setPending(data.action);
      } else if (data?.type === "message") {
        setMessages((m) => [...m, { role: "assistant", content: data.text || "(אין תשובה)" }]);
        setPending(null);
      } else if (data?.error) {
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ שגיאה: ${data.error}` }]);
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ שגיאה: ${e?.message ?? e}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    await callAssistant(next);
  }

  async function handleApprove() {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setMessages((m) => [...m, { role: "user", content: `✓ אישור: ${ACTION_LABELS[action.name] ?? action.name}` }]);
    await callAssistant(messages, action);
  }

  function handleReject() {
    setPending(null);
    setMessages((m) => [...m, { role: "user", content: "✗ ביטלתי את הפעולה" }, { role: "assistant", content: "בסדר, ביטלתי. במה עוד אוכל לעזור?" }]);
  }

  function reset() {
    setMessages([]);
    setPending(null);
    setInput("");
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "סגור עוזר AI" : "פתח עוזר AI"}
        className={cn(
          "fixed bottom-6 left-6 z-40 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all",
          "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          dir="rtl"
          className="fixed bottom-24 left-6 z-40 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">תפעול AI</p>
                <p className="text-[11px] text-muted-foreground">עוזר חכם • Gemini</p>
              </div>
            </div>
            <button
              onClick={reset}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted"
              title="שיחה חדשה"
            >
              נקה
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground mt-8 space-y-3">
                <Bot className="w-10 h-10 mx-auto text-primary/40" />
                <p className="font-medium">שלום! איך אוכל לעזור?</p>
                <div className="text-xs space-y-1 text-right bg-muted/40 rounded-lg p-3">
                  <p>• "כמה בקשות חופשה ממתינות?"</p>
                  <p>• "אילו נכסים פג תוקפם בחודש הקרוב?"</p>
                  <p>• "פתח פניית IT חדשה: מסך לא עובד"</p>
                  <p>• "אשר את בקשת החופשה של דני"</p>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground",
                  )}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-table:my-2 prose-headings:my-2 dark:prose-invert">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.content}</span>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-end">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  חושב...
                </div>
              </div>
            )}

            {pending && (
              <div className="border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  אישור פעולה: {ACTION_LABELS[pending.name] ?? pending.name}
                </div>
                <pre className="text-xs bg-background/60 rounded p-2 overflow-x-auto" dir="ltr">
                  {JSON.stringify(pending.args, null, 2)}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={handleApprove}
                    disabled={loading}
                    className="flex-1 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <Check className="w-3 h-3" /> אשר ובצע
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={loading}
                    className="flex-1 bg-muted text-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted/70 disabled:opacity-50"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="שאל אותי כל דבר..."
                disabled={loading || !!pending}
                className="flex-1 resize-none bg-muted rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring max-h-32 disabled:opacity-60"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim() || !!pending}
                className="w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-50"
                aria-label="שלח"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
