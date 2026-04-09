import { 
  Shield, Clock, CheckCircle2, AlertTriangle, User, 
  Timer, ChevronLeft, Mail, Wifi, HardDrive, Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

type TicketPriority = "critical" | "high" | "medium" | "low";
type TicketStatus = "open" | "in-progress" | "done";

interface Ticket {
  id: string;
  title: string;
  employee: string;
  type: "offboarding" | "access" | "software" | "hardware";
  priority: TicketPriority;
  status: TicketStatus;
  created: string;
  sla: string;
  checklist?: { label: string; done: boolean }[];
}

const priorityColors: Record<TicketPriority, string> = {
  critical: "bg-destructive text-destructive-foreground",
  high: "bg-warning text-warning-foreground",
  medium: "bg-info text-info-foreground",
  low: "bg-muted text-muted-foreground",
};

const priorityLabels: Record<TicketPriority, string> = {
  critical: "קריטי",
  high: "גבוה",
  medium: "בינוני",
  low: "נמוך",
};

const mockTickets: Ticket[] = [
  {
    id: "IT-041",
    title: "פרוטוקול ניתוק - רונית שמש",
    employee: "רונית שמש",
    type: "offboarding",
    priority: "critical",
    status: "in-progress",
    created: "07/04/2026 08:15",
    sla: "3:42:00",
    checklist: [
      { label: "השבתת תיבת דוא\"ל ronit@company.co.il", done: true },
      { label: "ביטול VPN - vpn.company.co.il", done: true },
      { label: "הסרת גישה לכונן \\\\server\\marketing", done: false },
      { label: "הסרת גישה לכונן \\\\server\\shared", done: false },
      { label: "ביטול חשבון CRM Salesforce", done: false },
      { label: "ביטול רישיון Adobe Creative Suite", done: false },
    ],
  },
  {
    id: "IT-042",
    title: "פרוטוקול ניתוק - עמוס גולן",
    employee: "עמוס גולן",
    type: "offboarding",
    priority: "critical",
    status: "open",
    created: "07/04/2026 09:30",
    sla: "4:00:00",
    checklist: [
      { label: "השבתת תיבת דוא\"ל amos@company.co.il", done: false },
      { label: "ביטול VPN + החזרת טוקן פיזי", done: false },
      { label: "הסרת גישה לכונן \\\\server\\engineering", done: false },
      { label: "הסרת גישה לכונן \\\\server\\projects\\TLV-Tower", done: false },
      { label: "ביטול רישיון AutoCAD", done: false },
      { label: "ביטול רישיון Revit", done: false },
    ],
  },
  {
    id: "IT-040",
    title: "הוספת גישת VPN - משה אברהם",
    employee: "משה אברהם",
    type: "access",
    priority: "medium",
    status: "open",
    created: "06/04/2026 14:00",
    sla: "—",
  },
  {
    id: "IT-039",
    title: "התקנת רישיון Office 365 - אמיר בן דוד",
    employee: "אמיר בן דוד",
    type: "software",
    priority: "low",
    status: "open",
    created: "05/04/2026 11:30",
    sla: "—",
  },
  {
    id: "IT-038",
    title: "איפוס סיסמת Active Directory - שרה דוד",
    employee: "שרה דוד",
    type: "access",
    priority: "medium",
    status: "done",
    created: "04/04/2026 16:45",
    sla: "—",
  },
];

export default function ITTickets() {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [checklist, setChecklist] = useState<{ label: string; done: boolean }[]>([]);

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setChecklist(ticket.checklist ? [...ticket.checklist] : []);
  };

  const toggleCheck = (index: number) => {
    setChecklist((prev) => prev.map((item, i) => i === index ? { ...item, done: !item.done } : item));
  };

  const allChecked = checklist.length > 0 && checklist.every((c) => c.done);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">משימות IT</h1>
        <p className="page-subtitle">ניהול קריאות שירות, ניתוקים ואבטחת מידע</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket list */}
        <div className={cn("lg:col-span-1 space-y-2", selectedTicket && "hidden lg:block")}>
          {mockTickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => openTicket(ticket)}
              className={cn(
                "w-full text-right bg-card rounded-xl border p-4 transition-all hover:shadow-md",
                ticket.type === "offboarding" ? "border-destructive/30 hover:border-destructive/60" : "border-border/50",
                selectedTicket?.id === ticket.id && "ring-2 ring-primary"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-muted-foreground">{ticket.id}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${priorityColors[ticket.priority]}`}>
                      {priorityLabels[ticket.priority]}
                    </span>
                  </div>
                  <p className="text-sm font-medium truncate">{ticket.title}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {ticket.created}
                  </div>
                </div>
                {ticket.type === "offboarding" && ticket.status !== "done" && (
                  <div className="flex items-center gap-1 text-xs font-mono text-destructive bg-destructive/10 px-2 py-1 rounded-md">
                    <Timer className="w-3 h-3" />
                    {ticket.sla}
                  </div>
                )}
                {ticket.status === "done" && (
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Ticket detail */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-card rounded-xl border border-border/50 shadow-card animate-fade-in">
              {/* Header */}
              <div className={cn(
                "p-5 border-b",
                selectedTicket.type === "offboarding" ? "border-destructive/20 bg-destructive/5" : "border-border/50"
              )}>
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="lg:hidden flex items-center gap-1 text-sm text-muted-foreground mb-3"
                >
                  <ChevronLeft className="w-4 h-4 rotate-180" />
                  חזרה לרשימה
                </button>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-muted-foreground">{selectedTicket.id}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColors[selectedTicket.priority]}`}>
                        {priorityLabels[selectedTicket.priority]}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold">{selectedTicket.title}</h2>
                    <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{selectedTicket.employee}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{selectedTicket.created}</span>
                    </div>
                  </div>
                  {selectedTicket.type === "offboarding" && selectedTicket.status !== "done" && (
                    <div className="flex flex-col items-center gap-1 bg-destructive/10 px-4 py-2 rounded-lg">
                      <Timer className="w-5 h-5 text-destructive" />
                      <span className="text-lg font-mono font-bold text-destructive">{selectedTicket.sla}</span>
                      <span className="text-[10px] text-destructive">SLA נותר</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Checklist (for offboarding) */}
              {selectedTicket.type === "offboarding" && (
                <div className="p-5">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-destructive" />
                    מטריצת ניתוקים
                  </h3>
                  <div className="space-y-3">
                    {checklist.map((item, i) => (
                      <label
                        key={i}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                          item.done
                            ? "bg-success/5 border-success/30"
                            : "bg-card border-border hover:bg-muted/50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => toggleCheck(i)}
                          className="w-5 h-5 rounded border-border accent-success"
                        />
                        <span className={cn("text-sm flex-1", item.done && "line-through text-muted-foreground")}>
                          {item.label}
                        </span>
                        {item.done && <CheckCircle2 className="w-4 h-4 text-success" />}
                      </label>
                    ))}
                  </div>

                  {/* Submit */}
                  <div className="mt-6 pt-4 border-t border-border/50">
                    <Button
                      disabled={!allChecked}
                      className={cn(
                        "w-full gap-2",
                        allChecked ? "bg-destructive hover:bg-destructive/90" : ""
                      )}
                    >
                      <Shield className="w-4 h-4" />
                      {allChecked ? "אשר ניתוק סופי (דורש סיסמה)" : `${checklist.filter(c => c.done).length}/${checklist.length} סעיפים הושלמו`}
                    </Button>
                  </div>
                </div>
              )}

              {selectedTicket.type !== "offboarding" && (
                <div className="p-8 text-center text-muted-foreground">
                  <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">פרטי הקריאה יוצגו כאן</p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border/50 shadow-card p-12 text-center text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">בחר קריאה מהרשימה</p>
              <p className="text-sm mt-1">לצפייה בפרטים ומטריצת ניתוקים</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
