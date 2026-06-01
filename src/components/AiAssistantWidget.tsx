import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send, Loader2, Check, AlertCircle, GripHorizontal, ExternalLink, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { name: string; args: Record<string, any> } | null;
type DocViewer = { url: string; name: string } | null;

const ACTION_LABELS: Record<string, string> = {
  create_employee: "יצירת עובד חדש",
  create_it_ticket: "פתיחת פניית IT",
  approve_leave_request: "עדכון סטטוס בקשת חופשה",
  close_it_ticket: "סגירת פניית IT",
};

const PANEL_W = 400;
const PANEL_H = 600;
const VIEWER_W = 720;
const VIEWER_H = 640;

function useDraggable(initial: { x: number; y: number }, size: { w: number; h: number }) {
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,textarea")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const nx = Math.max(8, Math.min(window.innerWidth - size.w - 8, e.clientX - dragRef.current.dx));
    const ny = Math.max(8, Math.min(window.innerHeight - size.h - 8, e.clientY - dragRef.current.dy));
    setPos({ x: nx, y: ny });
  }, [size.w, size.h]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return { pos, setPos, handlers: { onPointerDown, onPointerMove, onPointerUp } };
}

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [viewer, setViewer] = useState<DocViewer>(null);
  const { activeCompanyId } = useCompany();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const panel = useDraggable(
    { x: 24, y: typeof window !== "undefined" ? Math.max(24, window.innerHeight - PANEL_H - 96) : 100 },
    { w: PANEL_W, h: PANEL_H },
  );
  const viewerDrag = useDraggable(
    {
      x: typeof window !== "undefined" ? Math.max(24, (window.innerWidth - VIEWER_W) / 2) : 200,
      y: typeof window !== "undefined" ? Math.max(24, (window.innerHeight - VIEWER_H) / 2) : 80,
    },
    { w: VIEWER_W, h: VIEWER_H },
  );

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
        body: { messages: history, companyId: activeCompanyId ?? null, approvedAction },
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
    setMessages((m) => [
      ...m,
      { role: "user", content: "✗ ביטלתי את הפעולה" },
      { role: "assistant", content: "בסדר, ביטלתי. במה עוד אוכל לעזור?" },
    ]);
  }

  function reset() {
    setMessages([]);
    setPending(null);
    setInput("");
  }

  const openDoc = (url: string, name: string) => setViewer({ url, name });

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
          style={{ left: panel.pos.x, top: panel.pos.y, width: PANEL_W, height: PANEL_H }}
          className="fixed z-40 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <header
            {...panel.handlers}
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 cursor-move select-none touch-none"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-muted-foreground" />
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">תפעול AI</p>
                <p className="text-[11px] text-muted-foreground">עוזר חכם • Lovable AI</p>
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
                      <ReactMarkdown
                        components={{
                          a: ({ href, children, ...props }) => {
                            const url = href ?? "";
                            const label = String(Array.isArray(children) ? children.join("") : children ?? url);
                            const isDoc = /^https?:\/\//i.test(url);
                            return (
                              <a
                                href={url}
                                {...props}
                                onClick={(e) => {
                                  if (!isDoc) return;
                                  e.preventDefault();
                                  openDoc(url, label);
                                }}
                                className="text-primary underline cursor-pointer"
                              >
                                {children}
                              </a>
                            );
                          },
                        }}
                      >
                        {m.content}
                      </ReactMarkdown>
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

      {/* Floating document viewer */}
      {viewer && (
        <div
          dir="rtl"
          style={{ left: viewerDrag.pos.x, top: viewerDrag.pos.y, width: VIEWER_W, height: VIEWER_H }}
          className="fixed z-50 max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden"
        >
          <header
            {...viewerDrag.handlers}
            className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40 cursor-move select-none touch-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-semibold truncate">{viewer.name}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a
                href={viewer.url}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="פתח בכרטיסייה חדשה"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={viewer.url}
                download
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="הורד"
              >
                <Download className="w-4 h-4" />
              </a>
              <button
                onClick={() => setViewer(null)}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>
          <iframe
            src={viewer.url}
            title={viewer.name}
            className="flex-1 w-full bg-background"
          />
        </div>
      )}
    </>
  );
}
