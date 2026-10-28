/** Shared field checks for creating and editing an employee (wizard and edit dialog). */

export function isValidIsraeliId(id: string): boolean {
  const trimmed = id.replace(/\D/g, "");
  if (trimmed.length < 5 || trimmed.length > 9) return false;
  const padded = trimmed.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let digit = parseInt(padded[i], 10) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidPhone(phone: string): boolean {
  const cleaned = phone.trim().replace(/(?!^\+)[^\d]/g, "");
  return /^(\+972|0)(5\d)\d{7}$/.test(cleaned) || /^\+?\d{7,15}$/.test(cleaned);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export interface EmployeeFieldsInput {
  full_name?: string;
  id_number?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  start_date?: string;
  employee_code?: string;
}

/**
 * Errors keyed by field, in Hebrew, for the editable employee fields. Email is optional here
 * (existing employees may have none); when present it must be valid.
 */
export function validateEmployeeFields(f: EmployeeFieldsInput): Record<string, string> {
  const e: Record<string, string> = {};
  const name = (f.full_name ?? "").trim();
  if (!name) e.full_name = "שדה חובה";
  else if (name.length < 2) e.full_name = "שם קצר מדי";
  else if (name.length > 100) e.full_name = "שם ארוך מדי";

  if (f.employee_code !== undefined && !f.employee_code.trim()) e.employee_code = "שדה חובה";

  const id = (f.id_number ?? "").trim();
  if (!id) e.id_number = "שדה חובה";
  else if (!isValidIsraeliId(id)) e.id_number = "תעודת זהות לא תקינה";

  const email = (f.email ?? "").trim();
  if (email && (email.length > 255 || !isValidEmail(email))) e.email = "כתובת דוא\"ל לא תקינה";

  if (f.phone && f.phone.trim() && !isValidPhone(f.phone)) e.phone = "פורמט טלפון לא תקין";

  if (!(f.role ?? "").trim()) e.role = "שדה חובה";
  if (!(f.department ?? "").trim()) e.department = "שדה חובה";
  if (!f.start_date) e.start_date = "שדה חובה";
  return e;
}
