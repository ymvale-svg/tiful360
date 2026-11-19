import { translateAuthError } from "@/lib/authErrors";

const HEBREW = /[\u0590-\u05FF]/;

const MAP: { re: RegExp; he: string }[] = [
  { re: /employees_id_number_key|id_number.*(duplicate|unique)/i, he: "תעודת הזהות כבר רשומה אצל עובד אחר במערכת. בדוק את המספר" },
  { re: /employee_number.*(duplicate|unique)|(duplicate|unique).*employee_number/i, he: "מספר העובד כבר קיים. בחר מספר אחר" },
  { re: /email.*(duplicate|unique)|(duplicate|unique).*email/i, he: "כתובת הדוא\"ל כבר קיימת במערכת" },
  { re: /duplicate key|unique constraint|already exists/i, he: "הרשומה כבר קיימת במערכת" },
  { re: /row-level security|permission denied|not authorized|unauthorized|forbidden|\b403\b|\b401\b/i, he: "אין לך הרשאה לבצע פעולה זו. פנה למנהל המערכת" },
  { re: /foreign key|violates.*constraint.*(still referenced|is not present)/i, he: "לא ניתן להשלים את הפעולה כי הרשומה מקושרת לנתונים אחרים" },
  { re: /not-null|null value in column/i, he: "חסר שדה חובה. מלא את כל השדות המסומנים" },
  { re: /invalid input syntax.*date|date\/time field value out of range/i, he: "התאריך שהוזן אינו תקין. הזן תאריך בפורמט DD/MM/YYYY" },
  { re: /invalid input syntax|invalid input value/i, he: "אחד הערכים שהוזנו אינו תקין" },
  { re: /value too long/i, he: "אחד הערכים ארוך מדי" },
  { re: /check constraint/i, he: "אחד הערכים שהוזנו אינו מותר" },
  { re: /payload too large|file.*too large|exceeded the maximum allowed size|\b413\b/i, he: "הקובץ גדול מדי" },
  { re: /timeout|timed out/i, he: "הפעולה ארכה זמן רב מדי. נסה שוב" },
  { re: /jwt expired|session.*(expired|missing)|refresh token/i, he: "פג תוקף ההתחברות. התחבר מחדש" },
  { re: /not found|\b404\b/i, he: "הפריט המבוקש לא נמצא" },
  { re: /edge function|non-2xx|\b5\d\d\b|internal server error/i, he: "אירעה תקלה בשרת. נסה שוב בעוד רגע" },
];

const FALLBACK = "אירעה שגיאה. נסה שוב, ואם הבעיה חוזרת פנה למנהל המערכת";

/** Always returns a Hebrew message suitable for showing to an employee. */
export function toHebrewError(input: unknown): string {
  const raw =
    typeof input === "string" ? input
    : input && typeof input === "object" && "message" in input ? String((input as { message: unknown }).message ?? "")
    : String(input ?? "");
  if (!raw.trim()) return FALLBACK;
  if (HEBREW.test(raw)) return raw;
  for (const m of MAP) if (m.re.test(raw)) return m.he;
  const auth = translateAuthError(raw);
  if (auth && HEBREW.test(auth)) return auth;
  return FALLBACK;
}

/** Translate a toast text only if it's a plain string (leave JSX untouched). */
export function hebrewizeNode<T>(node: T): T {
  return (typeof node === "string" ? toHebrewError(node) : node) as T;
}
