import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Container } from "lucide-react";
import { useSiteContainers, CONTAINER_CATEGORY_NAME } from "@/hooks/useSiteContainers";

interface Props {
  siteId: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

/** Container picker — the list comes from existing "משרדים יבילים" inventory items. */
export function ContainerSelect({ siteId, value, onChange, label = "מכולה" }: Props) {
  const { data: containers } = useSiteContainers(siteId);

  const options = useMemo(
    () => (containers ?? []).map((c) => ({ value: c.id, label: c.name })),
    [containers],
  );

  return (
    <div>
      <Label className="text-sm mb-1.5 flex items-center gap-1.5">
        <Container className="w-4 h-4 text-primary" /> {label}
      </Label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder="בחר מכולה..."
        searchPlaceholder="חיפוש מכולה..."
        emptyText={`אין פריטים בקטגוריית "${CONTAINER_CATEGORY_NAME}" זמינים לאתר זה`}
      />
      <p className="text-[11px] text-muted-foreground mt-1">
        הרשימה מגיעה ממלאי "{CONTAINER_CATEGORY_NAME}" — להוספת מכולה חדשה יש להוסיף פריט בקטגוריה זו.
      </p>
    </div>
  );
}
