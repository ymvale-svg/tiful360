import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/hooks/useCompany";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, AlertCircle, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { exportToExcel } from "@/lib/exportExcel";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function prevMonthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
}

function formatDateIL(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface GapRow {
  employee_id: string;
  full_name: string;
  email: string | null;
  gap_date: string;
  gap_type: "empty" | "odd";
  punch_count: number;
  punch_times: string;
}

export function AttendanceGapsReport() {
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const initial = prevMonthRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading, refetch } = useQuery<GapRow[]>({
    queryKey: ["attendance-gaps", activeCompanyId, from, to],
    queryFn: async () => {
      if (!activeCompanyId) return [];
      const { data, error } = await supabase.rpc("get_attendance_gaps" as any, {
        _company_id: activeCompanyId, _from: from, _to: to,
      });
      if (error) throw error;
      return (data ?? []) as GapRow[];
    },
    enabled: !!activeCompanyId,
  });

  const byEmployee = useMemo(() => {
    const map = new Map<string, { full_name: string; email: string | null; rows: GapRow[] }>();
    for (const r of rows) {
      const cur = map.get(r.employee_id) ?? { full_name: r.full_name, email: r.email, rows: [] };
      cur.rows.push(r);
      map.set(r.employee_id, cur);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].full_name.localeCompare(b[1].full_name, "he"));
  }, [rows]);

  const allWithEmail = useMemo(
    () => byEmployee.filter(([, v]) => !!v.email).map(([id]) => id),
    [byEmployee],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === allWithEmail.length) setSelected(new Set());
    else setSelected(new Set(allWithEmail));
  };

  const sendEmails = async (employeeIds?: string[]) => {
    if (!activeCompanyId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-attendance-gaps", {
        body: { company_id: activeCompanyId, from, to, employee_ids: employeeIds },
      });
      if (error) throw error;
      toast({
        title: "המיילים נשלחו לתור",
        description: `נשלחו ${data?.queued ?? 0} מיילים, ${data?.skipped_no_email ?? 0} ללא כתובת.`,
      });
      setSelected(new Set());
    } catch (e: any) {
      toast({ title: "שגיאה בשליחה", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendBulk = async () => {
    const ids = selected.size ? Array.from(selected) : allWithEmail;
    if (!ids.length) {
      toast({ title: "אין עובדים לשליחה", description: "אין פערים עם כתובת מייל בטווח שנבחר.", variant: "destructive" });
      return;
    }
    if (!confirm(`לשלוח מייל פירוט פערים ל-${ids.length} עובדים?`)) return;
    await sendEmails(ids);
  };

  const handleExport = () => {
    if (!rows.length) return;
    exportToExcel(
      rows.map((r) => ({
        full_name: r.full_name,
        email: r.email ?? "",
        date: formatDateIL(r.gap_date),
        weekday: WEEKDAYS[new Date(r.gap_date).getDay()],
        type: r.gap_type === "empty" ? "יום ריק" : "אי-זוגי",
        count: r.punch_count,
        times: r.punch_times,
      })),
      [
        { key: "full_name", label: "שם עובד" },
        { key: "email", label: "אימייל" },
        { key: "date", label: "תאריך" },
        { key: "weekday", label: "יום" },
        { key: "type", label: "סוג פער" },
        { key: "count", label: "מס' החתמות" },
        { key: "times", label: "החתמות קיימות" },
      ],
      `פערי_החתמה_${from}_עד_${to}`,
    );
  };

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-accent/30 transition-colors">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              דוח פערי החתמה
              {byEmployee.length > 0 && (
                <Badge variant="outline" className="font-mono">
                  {byEmployee.length} עובדים · {rows.length} ימים
                </Badge>
              )}
              <div className="flex-1" />
              {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end mb-4">
              <div>
                <label className="text-xs text-muted-foreground">מתאריך</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">עד תאריך</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>רענון</Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows.length}>
                <FileSpreadsheet className="w-4 h-4 ml-1" />ייצא לאקסל
              </Button>
              <div className="flex-1" />
              <Button size="sm" onClick={sendBulk} disabled={sending || !allWithEmail.length}>
                <Send className="w-4 h-4 ml-1" />
                {selected.size
                  ? `שלח ל-${selected.size} עובדים נבחרים`
                  : `שלח לכל העובדים עם פערים (${allWithEmail.length})`}
              </Button>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">טוען…</div>
            ) : byEmployee.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                לא נמצאו פערי החתמה בטווח הנבחר 🎉
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="p-2 text-right w-8">
                        <Checkbox
                          checked={selected.size > 0 && selected.size === allWithEmail.length}
                          onCheckedChange={toggleAll}
                        />
                      </th>
                      <th className="p-2 text-right">עובד</th>
                      <th className="p-2 text-right">אימייל</th>
                      <th className="p-2 text-right">ימי פער</th>
                      <th className="p-2 text-right">פירוט</th>
                      <th className="p-2 text-right">פעולה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byEmployee.map(([empId, info]) => (
                      <tr key={empId} className="border-b align-top hover:bg-muted/30">
                        <td className="p-2">
                          <Checkbox
                            checked={selected.has(empId)}
                            onCheckedChange={() => toggle(empId)}
                            disabled={!info.email}
                          />
                        </td>
                        <td className="p-2 font-medium">{info.full_name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{info.email ?? "—"}</td>
                        <td className="p-2"><Badge variant="outline">{info.rows.length}</Badge></td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-1">
                            {info.rows.map((r) => (
                              <span
                                key={r.gap_date}
                                className={`px-2 py-0.5 rounded text-xs font-mono ${
                                  r.gap_type === "empty"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                                }`}
                                title={r.punch_times || "ללא החתמות"}
                              >
                                {formatDateIL(r.gap_date)} {WEEKDAYS[new Date(r.gap_date).getDay()]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={sending || !info.email}
                            onClick={() => sendEmails([empId])}
                          >
                            <Mail className="w-4 h-4 ml-1" />שלח
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
