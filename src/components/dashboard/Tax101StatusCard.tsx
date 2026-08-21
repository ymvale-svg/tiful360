import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useCompanyTax101Forms } from "@/hooks/useTax101";

export function Tax101StatusCard() {
  const year = new Date().getFullYear();
  const { data: forms = [], isLoading } = useCompanyTax101Forms(year);

  const pending = forms.filter((f: any) => f.status === "pending").length;
  const signed = forms.filter((f: any) => f.status === "signed").length;
  const sent = forms.filter((f: any) => f.status === "sent").length;

  const stats = [
    { label: "ממתינים לחתימה", value: pending, cls: "text-warning" },
    { label: "נחתמו", value: signed, cls: "text-success" },
    { label: "נשלחו", value: sent, cls: "text-muted-foreground" },
  ];

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-card">
      <div className="p-5 border-b border-border/50 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          טפסי 101 ({year})
        </h2>
        <Link to="/payroll" className="text-xs text-primary hover:underline">הכל</Link>
      </div>
      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">טוען...</div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border/50">
          {stats.map((s) => (
            <div key={s.label} className="p-4 text-center">
              <p className={`text-xl font-semibold ${s.cls}`}>{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
