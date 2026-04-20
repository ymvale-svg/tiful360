// מיפוי שגיאות אימות (Supabase Auth + Google OAuth) לעברית

const ERROR_MAP: { match: (s: string) => boolean; he: string }[] = [
  // Supabase Auth - email/password
  { match: (s) => /invalid login credentials/i.test(s), he: 'פרטי הכניסה שגויים. בדוק את הדוא"ל והסיסמה' },
  { match: (s) => /email not confirmed/i.test(s), he: 'הדוא"ל טרם אומת. בדוק את תיבת הדואר שלך' },
  { match: (s) => /user not found/i.test(s), he: "משתמש לא נמצא במערכת" },
  { match: (s) => /invalid email/i.test(s) || /unable to validate email address/i.test(s), he: 'כתובת דוא"ל לא תקינה' },
  { match: (s) => /password should be at least/i.test(s), he: "הסיסמה חייבת להכיל לפחות 6 תווים" },
  { match: (s) => /email rate limit exceeded/i.test(s), he: "יותר מדי ניסיונות. נסה שוב בעוד מספר דקות" },
  { match: (s) => /for security purposes.*60 seconds/i.test(s), he: "מטעמי אבטחה ניתן לבקש איפוס פעם ב-60 שניות בלבד" },
  { match: (s) => /too many requests/i.test(s) || /rate limit/i.test(s), he: "יותר מדי בקשות. נסה שוב מאוחר יותר" },
  { match: (s) => /user already registered/i.test(s), he: "משתמש זה כבר רשום במערכת" },
  { match: (s) => /weak password/i.test(s), he: "הסיסמה חלשה מדי. בחר סיסמה חזקה יותר" },
  { match: (s) => /signup.*disabled/i.test(s), he: "הרשמה אינה מאופשרת כרגע" },

  // Google OAuth
  { match: (s) => /redirect_uri_mismatch/i.test(s), he: "בעיה בהגדרות הכניסה עם Google. פנה למנהל המערכת" },
  { match: (s) => /access_denied/i.test(s), he: "הכניסה עם Google בוטלה" },
  { match: (s) => /popup_closed_by_user|popup closed/i.test(s), he: "חלון הכניסה נסגר לפני השלמת התהליך" },
  { match: (s) => /oauth.*not enabled|provider.*not enabled/i.test(s), he: "הכניסה עם Google אינה זמינה כרגע" },
  { match: (s) => /invalid_client/i.test(s), he: "בעיה בהגדרות הלקוח של Google. פנה למנהל המערכת" },
  { match: (s) => /unauthorized_client/i.test(s), he: "הכניסה עם Google אינה מורשית מהדומיין הזה. פנה למנהל המערכת" },

  // Network
  { match: (s) => /network request failed|failed to fetch|network error/i.test(s), he: "בעיית תקשורת. בדוק את חיבור האינטרנט" },
];

export function translateAuthError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object"
      ? (error as any).message || (error as any).error_description || (error as any).error || ""
      : "";

  if (!raw) return "אירעה שגיאה. נסה שוב.";

  for (const entry of ERROR_MAP) {
    if (entry.match(raw)) return entry.he;
  }

  return "אירעה שגיאה. נסה שוב.";
}
