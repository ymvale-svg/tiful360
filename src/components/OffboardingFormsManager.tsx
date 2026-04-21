import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  ExternalLink,
  FileSignature,
  Trash2,
  CheckCircle2,
  Clock,
  Plus,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompany";

interface Asset {
  id: string;
  asset_name: string;
  asset_code: string;
  serial_number: string | null;
  manufacturer_model: string | null;
  asset_categories?: { category_name: string } | null;
}

interface Employee {
  id: string;
  full_name: string;
  employee_code: string;
  id_number: string;
  department: string;
  role: string;
  end_date?: string | null;
  company_id: string | null;
}

interface Props {
  employee: Employee;
  assets: Asset[];
}

type Condition = "good" | "damaged" | "missing";

interface RowState {
  selected: boolean;
  condition: Condition;
  notes: string;
}

export function OffboardingFormsManager({ employee, assets }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();

  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [creating, setCreating] = useState(false);

  // Existing offboarding forms for this employee
  const { data: forms = [], refetch } = useQuery({
    queryKey: ["offboarding-forms", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offboarding_forms")
        .select("*")
        .eq("employee_id", employee.id)
        .order("form_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Asset IDs already included in any non-cancelled form
  const lockedAssetIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of forms) {
      if (f.status === "cancelled") continue;
      const list = (f.form_snapshot as any)?.assets ?? [];
      for (const a of list) if (a.asset_id) set.add(a.asset_id);
    }
    return set;
  }, [forms]);

  // Initialise row state when assets change
  useEffect(() => {
    setRows((prev) => {
      const next: Record<string, RowState> = {};
      for (const a of assets) {
        next[a.id] = prev[a.id] ?? {
          selected: false,
          condition: "good",
          notes: "",
        };
      }
      return next;
    });
  }, [assets]);

  const availableAssets = assets.filter((a) => !lockedAssetIds.has(a.id));
  const selectedAssets = availableAssets.filter((a) => rows[a.id]?.selected);

  const updateRow = (id: string, patch: Partial<RowState>) =>
    setRows((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const handleCreate = async () => {
    if (selectedAssets.length === 0) {
      toast({ title: "בחר לפחות פריט אחד", variant: "destructive" });
      return;
    }
    if (!employee.company_id) {
      toast({ title: "חסר שיוך חברה לעובד", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const nextIndex = (forms?.length ?? 0) + 1;
      const formSnapshot = {
        form_type: "asset_return",
        form_index: nextIndex,
        company_name: activeCompany?.name ?? "",
        company_logo_url: activeCompany?.logo_url ?? null,
        employee_name: employee.full_name,
        employee_id_number: employee.id_number,
        employee_department: employee.department,
        employee_role: employee.role,
        end_date: employee.end_date,
        date: new Date().toISOString(),
        assets: selectedAssets.map((a) => ({
          asset_id: a.id,
          asset_name: a.asset_name,
          asset_code: a.asset_code,
          category_name: a.asset_categories?.category_name ?? null,
          manufacturer_model: a.manufacturer_model,
          serial_number: a.serial_number,
          condition_at_return: rows[a.id]?.condition ?? "good",
          notes: rows[a.id]?.notes ?? "",
        })),
      };

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("offboarding_forms").insert({
        company_id: employee.company_id,
        employee_id: employee.id,
        end_date: employee.end_date ?? null,
        form_index: nextIndex,
        form_snapshot: formSnapshot,
        created_by: user?.id,
      });
      if (error) throw error;

      // Reset selections
      setRows((p) => {
        const next = { ...p };
        for (const a of selectedAssets) {
          next[a.id] = { selected: false, condition: "good", notes: "" };
        }
        return next;
      });

      toast({ title: `נוצר טופס #${nextIndex}`, description: "ניתן להעתיק את קישור החתימה" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["offboarding-forms"] });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (formId: string) => {
    if (!confirm("למחוק טופס זה? פריטיו יחזרו להיות זמינים ליצירת טופס חדש.")) return;
    const { error } = await supabase.from("offboarding_forms").delete().eq("id", formId);
    if (error) {
      toast({ title: "שגיאה", description: error.message, variant: "destructive" });
      return;
    }
    refetch();
  };

  const buildSignUrl = (token: string) =>
    `${window.location.origin}/sign-offboarding/${token}`;

  const copyLink = async (token: string) => {
    await navigator.clipboard.writeText(buildSignUrl(token));
    toast({ title: "הקישור הועתק" });
  };

  return (
    <div className="space-y-6">
      {/* Existing forms */}
      <div>
        <h3 className="text-sm font-semibold mb-2">טפסי החזרה שנוצרו</h3>
        {forms.length === 0 ? (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
            עדיין לא נוצרו טפסי החזרה.
          </div>
        ) : (
          <div className="space-y-2">
            {forms.map((f) => {
              const list = (f.form_snapshot as any)?.assets ?? [];
              const signed = f.status === "signed";
              return (
                <div
                  key={f.id}
                  className="border rounded-lg p-3 bg-card flex items-center gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-2">
                    {signed ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-600" />
                    )}
                    <span className="font-medium text-sm">טופס #{f.form_index}</span>
                    <span className="text-xs text-muted-foreground">
                      {list.length} פריטים
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {signed
                      ? `נחתם ${new Date(f.signed_at).toLocaleDateString("he-IL")}`
                      : "ממתין לחתימה"}
                  </span>
                  <div className="flex items-center gap-1 mr-auto">
                    {!signed && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => copyLink(f.sign_token)}
                        >
                          <Copy className="w-3 h-3" />
                          העתק קישור
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          asChild
                        >
                          <a
                            href={buildSignUrl(f.sign_token)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            פתח
                          </a>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          onClick={() => handleDelete(f.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    {signed && f.pdf_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        asChild
                      >
                        <a href={f.pdf_url} target="_blank" rel="noreferrer">
                          <Download className="w-3 h-3" />
                          PDF
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New form builder */}
      <div>
        <h3 className="text-sm font-semibold mb-2">יצירת טופס חדש</h3>
        {availableAssets.length === 0 ? (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
            כל הציוד של העובד כבר נכלל בטופס קיים.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-start w-10"></th>
                  <th className="p-2 text-start">פריט</th>
                  <th className="p-2 text-start">מס׳ סידורי</th>
                  <th className="p-2 text-start w-32">מצב</th>
                  <th className="p-2 text-start w-40">הערות</th>
                </tr>
              </thead>
              <tbody>
                {availableAssets.map((a) => {
                  const r = rows[a.id] ?? {
                    selected: false,
                    condition: "good" as Condition,
                    notes: "",
                  };
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="p-2">
                        <Checkbox
                          checked={r.selected}
                          onCheckedChange={(v) =>
                            updateRow(a.id, { selected: !!v })
                          }
                        />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{a.asset_name}</div>
                        <div className="text-xs text-muted-foreground font-mono" dir="ltr">
                          {a.asset_code}
                        </div>
                      </td>
                      <td className="p-2 font-mono text-xs" dir="ltr">
                        {a.serial_number || "—"}
                      </td>
                      <td className="p-2">
                        <Select
                          value={r.condition}
                          onValueChange={(v) =>
                            updateRow(a.id, { condition: v as Condition })
                          }
                          disabled={!r.selected}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="good">תקין</SelectItem>
                            <SelectItem value="damaged">לא תקין</SelectItem>
                            <SelectItem value="missing">חסר</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          value={r.notes}
                          onChange={(e) =>
                            updateRow(a.id, { notes: e.target.value })
                          }
                          disabled={!r.selected}
                          className="h-8 text-xs"
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="p-3 bg-muted/30 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                נבחרו {selectedAssets.length} פריטים
              </span>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={creating || selectedAssets.length === 0}
                className="gap-1"
              >
                <FileSignature className="w-4 h-4" />
                {creating ? "יוצר..." : "צור טופס לחתימה"}
              </Button>
            </div>
          </div>
        )}

        {lockedAssetIds.size > 0 && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
            <Plus className="w-3 h-3" />
            פריטים שכבר נכללו בטפסים קודמים אינם מוצגים.
          </div>
        )}
      </div>
    </div>
  );
}
