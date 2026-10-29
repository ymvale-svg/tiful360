// Builds the rows for the "employee contact list" Excel export:
// name, department, phone, email — the four columns asked for by the user.
//
// The employee list itself comes from the public view (which has no phone or
// email), so phone/email are looked up from the full employee rows the page
// already loads. Missing values stay empty strings so the sheet has no "null".

export interface EmployeeContactRow {
  full_name: string;
  department: string;
  phone: string;
  email: string;
}

export const EMPLOYEE_CONTACT_HEADERS: { key: keyof EmployeeContactRow; label: string }[] = [
  { key: "full_name", label: "שם מלא" },
  { key: "department", label: "מחלקה" },
  { key: "phone", label: "טלפון" },
  { key: "email", label: "מייל" },
];

type ContactSource = { phone?: string | null; email?: string | null };

export function buildEmployeeContactRows<
  T extends { id: string; full_name?: string | null; department?: string | null },
>(
  employees: readonly T[],
  contactById: Map<string, ContactSource>,
): EmployeeContactRow[] {
  return employees.map((e) => {
    const c = contactById.get(e.id);
    return {
      full_name: e.full_name ?? "",
      department: e.department ?? "",
      phone: c?.phone ?? "",
      email: c?.email ?? "",
    };
  });
}
