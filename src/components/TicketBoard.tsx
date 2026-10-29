// Ticket board adapted from "Kanban Board" (uvain, layro) on 21st.dev: a column per status, cards
// that can be dragged between columns, and the same move available from a menu on every card, so it
// never depends on dragging (keyboard, touch and switch users get the same action).
import { useState, type DragEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, CircleDot, Loader, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type BoardStatus = "open" | "in_progress" | "done";

const COLUMNS: { status: BoardStatus; label: string; icon: typeof CircleDot; tint: string }[] = [
  { status: "open", label: "נפתחו", icon: CircleDot, tint: "text-info" },
  { status: "in_progress", label: "בטיפול", icon: Loader, tint: "text-warning" },
  { status: "done", label: "טופלו", icon: CheckCircle2, tint: "text-success" },
];

/** Closed tickets older than this stay off the board; the list view still has them. */
const DONE_DAYS = 14;

export interface BoardTicket {
  id: string;
  status: string;
  title: string;
  ticket_code?: string | null;
  priority?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
}

interface TicketBoardProps<T extends BoardTicket> {
  tickets: readonly T[];
  onOpen: (ticket: T) => void;
  onMove: (ticket: T, status: BoardStatus) => void;
  /** Extra line under the title: subject, employee, SLA. */
  renderMeta?: (ticket: T) => ReactNode;
  priorityLabel?: (priority: string) => string;
  priorityClass?: (priority: string) => string;
  busyId?: string | null;
}

export function TicketBoard<T extends BoardTicket>({ tickets, onOpen, onMove, renderMeta, priorityLabel, priorityClass, busyId }: TicketBoardProps<T>) {
  const reduced = useReducedMotion();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<BoardStatus | null>(null);
  const cutoff = Date.now() - DONE_DAYS * 86_400_000;

  const byStatus = (status: BoardStatus) =>
    tickets.filter((t) => t.status === status && (status !== "done" || new Date(t.resolved_at ?? t.updated_at ?? 0).getTime() >= cutoff));

  const drop = (e: DragEvent, status: BoardStatus) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    const ticket = tickets.find((t) => t.id === id);
    if (ticket && ticket.status !== status) onMove(ticket, status);
  };

  return (
    <div className="grid grid-flow-col auto-cols-[minmax(17rem,1fr)] gap-4 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-3 lg:auto-cols-auto">
      {COLUMNS.map((col) => {
        const items = byStatus(col.status);
        const Icon = col.icon;
        return (
          <section
            key={col.status}
            aria-labelledby={`board-${col.status}`}
            onDragOver={(e) => { e.preventDefault(); setOver(col.status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={(e) => drop(e, col.status)}
            className={cn(
              "flex min-h-[18rem] flex-col rounded-2xl border bg-muted/40 p-2 transition-colors",
              over === col.status ? "border-primary bg-primary/5" : "border-border/60",
            )}
          >
            <h2 id={`board-${col.status}`} className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
              <Icon className={cn("h-4 w-4", col.tint)} aria-hidden="true" />
              {col.label}
              <span className="rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{items.length}</span>
              {col.status === "done" && <span className="ms-auto text-[11px] font-normal text-muted-foreground">{DONE_DAYS} ימים אחרונים</span>}
            </h2>
            <ul className="flex flex-1 flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.map((t) => (
                  <motion.li
                    key={t.id}
                    layout={!reduced}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  >
                    <div
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; setDragId(t.id); }}
                      onDragEnd={() => { setDragId(null); setOver(null); }}
                      aria-busy={busyId === t.id || undefined}
                      className={cn(
                        "group relative cursor-grab rounded-xl border border-border/60 bg-card p-3 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing focus-within:ring-2 focus-within:ring-ring",
                        dragId === t.id && "opacity-50",
                        busyId === t.id && "opacity-60",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            {t.ticket_code && <span className="font-mono text-[11px] text-muted-foreground">{t.ticket_code}</span>}
                            {t.priority && priorityLabel && (
                              <span className={cn("rounded-full px-1.5 py-px text-[11px] font-medium", priorityClass?.(t.priority))}>{priorityLabel(t.priority)}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => onOpen(t)}
                            className="block w-full text-right text-sm font-medium leading-snug focus:outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
                          >
                            {t.title}
                          </button>
                          {renderMeta && <div className="relative z-10 mt-1 text-xs text-muted-foreground">{renderMeta(t)}</div>}
                        </div>
                        <DropdownMenu dir="rtl">
                          <DropdownMenuTrigger
                            className="relative z-10 -m-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                            aria-label={`העברת הקריאה ${t.ticket_code ?? t.title}`}
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden="true" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>העברה אל</DropdownMenuLabel>
                            {COLUMNS.filter((c) => c.status !== t.status).map((c) => (
                              <DropdownMenuItem key={c.status} onSelect={() => onMove(t, c.status)} className="gap-2">
                                <c.icon className={cn("h-4 w-4", c.tint)} aria-hidden="true" />
                                {c.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
              {items.length === 0 && (
                <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                  {over === col.status ? "שחררו כאן" : "אין קריאות"}
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
