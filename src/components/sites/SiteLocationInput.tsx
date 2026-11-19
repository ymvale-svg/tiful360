import { useId } from "react";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/feedback/FormField";
import { useSiteLocations } from "@/hooks/useSiteLocations";

interface Props {
  siteId: string;
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

/** Free-text spot inside the assigned site (e.g. "מטבח קומה 2"), with suggestions from that site. */
export function SiteLocationInput({ siteId, value, onChange, label = "מיקום בתוך האתר" }: Props) {
  const { data: locations } = useSiteLocations(siteId);
  const listId = `site-locations-${useId()}`;
  return (
    <>
    <FormField label={label} hint="לדוגמה: מטבח קומה 2, חדר ישיבות. כך אפשר לאתר כל פריט באתר.">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        maxLength={120}
        placeholder="מיקום מדויק (לא חובה)"
        dir="rtl"
      />
    </FormField>
    <datalist id={listId}>
      {(locations ?? []).map((l) => <option key={l} value={l} />)}
    </datalist>
    </>
  );
}
