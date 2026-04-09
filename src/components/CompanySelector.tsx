import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function CompanySelector() {
  const { companies, activeCompanyId, setActiveCompanyId, loading } = useCompany();
  const { isSuperAdmin } = useAuth();

  if (loading || companies.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <Select value={activeCompanyId ?? ""} onValueChange={setActiveCompanyId}>
        <SelectTrigger className="w-[200px] h-8 text-sm">
          <SelectValue placeholder="בחר חברה" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
