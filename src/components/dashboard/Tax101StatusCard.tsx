import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useCompanyTax101Forms } from "@/hooks/useTax101";
import { KpiTile } from "@/components/ui/kpi-tile";

export function Tax101StatusCard() {
  const year = new Date().getFullYear();
  const { data: forms = [], isLoading, error } = useCompanyTax101Forms(year);

  const pending = forms.filter((f: any) => f.status === "pending").length;
  const signed = forms.filter((f: any) => f.status === "signed").length;
  const sent = forms.filter((f: any) => f.status === "sent").length;

  const stats = [
    { label: "ממתינים לחתימה", value: pending },
    { label: "נחתמו", value: signed },
    { label: "נשלחו", value: sent },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
          טפסי 101 ({year})
        </h2>
        <Link to="/payroll" className="text-xs text-primary hover:underline">הכל</Link>
      </div>
      {error && !isLoading ? (
        <div className="p-6 text-center text-sm" role="alert">לא הצלחנו לטעון את טפסי 101</div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border/50">
          {stats.map((s) => (
            // The numbers share the card's "הכל" link: the payroll hub has no per-status filter.
            <KpiTile
              key={s.label}
              label={s.label}
              value={isLoading ? undefined : s.value}
              loading={isLoading}
              format={(n) => Math.round(n).toLocaleString("he-IL")}
              className="gap-1 rounded-none border-0 bg-transparent p-3 shadow-none [&>p:first-child]:whitespace-normal [&_[data-slot=kpi-caption]]:hidden"
            />
          ))}
        </div>
      )}
    </div>
  );
}
