import { FileSignature } from "lucide-react";
import { useEmployeeHandoverForms } from "@/hooks/useHandoverForms";
import { HandoverFormsList } from "@/components/handover/HandoverFormsList";

interface Props {
  employeeId: string;
}

/** Signed handover / return protocols of the logged-in employee. */
export function MyProtocolsList({ employeeId }: Props) {
  const { data: forms = [] } = useEmployeeHandoverForms(employeeId);
  if (forms.length === 0) return null;

  return (
    <div className="space-y-2">
      <h2 className="font-semibold text-sm flex items-center gap-1.5 mt-6">
        <FileSignature className="w-4 h-4 text-primary" />
        טפסים חתומים ({forms.length})
      </h2>
      <HandoverFormsList forms={forms} context="employee" />
    </div>
  );
}
