import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAssetCategories } from "@/hooks/useData";
import { useAssetGroups } from "@/hooks/useAssetGroups";
import { getEmployeeDocumentSignedUrl } from "@/hooks/useEmployeeDocuments";
import { useToast } from "@/hooks/use-toast";
import { OnboardingChecklist } from "@/components/onboarding/OnboardingChecklist";
import {
  ONBOARDING_STATUS_LABEL,
  daysUntil,
  type OnboardingProcess,
} from "@/hooks/useOnboarding";
import { OWNER_ROLE_LABEL } from "@/lib/domainConfig";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/utils";
import {
  ClipboardList,
  FileDown,
  LifeBuoy,
  StickyNote,
  CheckCircle2,
  Circle,
} from "lucide-react";

interface Props {
  process: OnboardingProcess;
}

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info/10 text-info",
  in_progress: "bg-warning/10 text-warning",
  done: "bg-success/10 text-success",
};

/** Read-only summary of the employee's onboarding process, with access to the checklist. */
export function EmployeeOnboardingTab({ process }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: categories = [] } = useAssetCategories();
  const { data: groups = [] } = useAssetGroups();
  const [checklistOpen, setChecklistOpen] = useState(false);

  const items = useMemo(
    () =>
      [...(process.onboarding_items ?? [])].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      ),
    [process]
  );
  const doneCount = items.filter((i) => i.status === "done").length;

  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, typeof items>>();
    for (const it of items) {
      const cat = (categories as any[]).find((c) => c.id === it.catalog_ref_id);
      const group = groups.find((g) => g.id === it.selected_group_id);
      const catName = cat?.category_name || "כללי";
      const subName = group?.name || "—";
      if (!map.has(catName)) map.set(catName, new Map());
      const subMap = map.get(catName)!;
      if (!subMap.has(subName)) subMap.set(subName, [] as any);
      (subMap.get(subName) as any).push(it);
    }
    return Array.from(map.entries()).map(([category, subs]) => ({
      category,
      subs: Array.from(subs.entries()),
    }));
  }, [items, categories, groups]);

  const openProtocol = async () => {
    if (!process.pdf_url) return;
    const url = await getEmployeeDocumentSignedUrl(process.pdf_url);
    if (!url) {
      toast({ title: "לא ניתן לפתוח את הפרוטוקול", variant: "destructive" });
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  const dLeft = daysUntil(process.employees?.start_date);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="bg-card rounded-xl border border-border/50 shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">תהליך קליטת עובד</h3>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                STATUS_CLASS[process.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {ONBOARDING_STATUS_LABEL[process.status] ?? process.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setChecklistOpen(true)}>
              <ClipboardList className="w-4 h-4" /> פתח צ'קליסט
            </Button>
            {process.pdf_url && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={openProtocol}>
                <FileDown className="w-4 h-4" /> פרוטוקול הקליטה
              </Button>
            )}
            {process.it_ticket_id && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => navigate(`/it-tickets?ticket=${process.it_ticket_id}`)}
              >
                <LifeBuoy className="w-4 h-4" /> קריאת השירות
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-4 border-t border-border/50 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">פריטים שבוצעו</p>
            <p className="font-semibold mt-0.5">
              {doneCount} מתוך {items.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">תחילת עבודה</p>
            <p className="font-semibold mt-0.5">
              {formatDateDMY(process.employees?.start_date)}
              {dLeft !== null && dLeft >= 0 && (
                <span className="text-xs text-muted-foreground"> · בעוד {dLeft} ימים</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">נשלח לתפעול</p>
            <p className="font-semibold mt-0.5">{formatDateTimeDMY(process.sent_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">גרסת פרוטוקול</p>
            <p className="font-semibold mt-0.5">{process.protocol_version ?? 1}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          נפתח ב-{formatDateTimeDMY(process.created_at)}
          {process.completed_at ? ` · הושלם ב-${formatDateTimeDMY(process.completed_at)}` : ""}
        </p>
      </div>

      {grouped.map(({ category, subs }) => (
        <div key={category} className="bg-card rounded-xl border border-border/50 shadow-card p-5">
          <h4 className="text-sm font-semibold mb-3">{category}</h4>
          <div className="space-y-4">
            {subs.map(([subName, subItems]) => (
              <div key={subName} className="rounded-lg bg-muted/30 p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">{subName}</p>
                <div className="space-y-2">
                  {(subItems as any[]).map((item: any) => (
                    <div key={item.id} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-start gap-2">
                        {item.status === "done" ? (
                          <CheckCircle2 className="w-4 h-4 mt-0.5 text-success shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{item.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              {OWNER_ROLE_LABEL[item.owner_role] ?? item.owner_role}
                            </span>
                            {item.assigned_at && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                                הוצמד ב-{formatDateTimeDMY(item.assigned_at)}
                              </span>
                            )}
                          </div>
                          {item.notes && (
                            <p className="text-xs mt-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-start gap-1.5">
                              <StickyNote className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
                              <span>
                                <span className="font-medium">הערה לתפעול: </span>
                                {item.notes}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <OnboardingChecklist
        process={checklistOpen ? process : null}
        onOpenChange={(o) => !o && setChecklistOpen(false)}
      />
    </div>
  );
}
