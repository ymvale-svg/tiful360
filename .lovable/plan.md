
המשתמש מבקש למפות את כל שגיאות הכניסה (login errors) במערכת ולתרגם אותן לעברית. כרגע ב-`Login.tsx` השגיאות מוצגות עם `error.message` הגולמי שמגיע מ-Supabase/Google באנגלית (למשל "Invalid login credentials", "Email not confirmed", "redirect_uri_mismatch" וכו').

### המטרה
להחליף את ההצגה הגולמית של הודעות שגיאה במיפוי לעברית ידידותי למשתמש, עבור 3 הזרימות בקובץ `src/pages/Login.tsx`:
1. כניסה עם דוא"ל + סיסמה
2. שכחתי סיסמה
3. כניסה עם Google

### גישה
ליצור פונקציית עזר חדשה `src/lib/authErrors.ts` עם מילון מיפוי קודי/הודעות שגיאה נפוצות מ-Supabase Auth ו-Google OAuth ל-טקסט בעברית. הפונקציה תקבל את אובייקט השגיאה ותחזיר מחרוזת בעברית. אם השגיאה לא מוכרת — תוחזר הודעת ברירת מחדל גנרית בעברית ("אירעה שגיאה. נסה שוב.").

### מיפוי השגיאות המתוכנן

**שגיאות סיסמה/דוא"ל (Supabase Auth):**
| הודעה באנגלית | תרגום לעברית |
|---|---|
| Invalid login credentials | פרטי הכניסה שגויים. בדוק את הדוא"ל והסיסמה |
| Email not confirmed | הדוא"ל טרם אומת. בדוק את תיבת הדואר שלך |
| User not found | משתמש לא נמצא במערכת |
| Invalid email | כתובת דוא"ל לא תקינה |
| Password should be at least 6 characters | הסיסמה חייבת להכיל לפחות 6 תווים |
| Email rate limit exceeded | יותר מדי ניסיונות. נסה שוב בעוד מספר דקות |
| Too many requests | יותר מדי בקשות. נסה שוב מאוחר יותר |
| User already registered | משתמש זה כבר רשום במערכת |
| Network request failed | בעיית תקשורת. בדוק את חיבור האינטרנט |

**שגיאות איפוס סיסמה:**
| הודעה באנגלית | תרגום לעברית |
|---|---|
| For security purposes, you can only request this once every 60 seconds | מטעמי אבטחה ניתן לבקש איפוס פעם ב-60 שניות בלבד |
| Unable to validate email address | כתובת הדוא"ל לא תקינה |

**שגיאות Google OAuth:**
| הודעה / קוד | תרגום לעברית |
|---|---|
| redirect_uri_mismatch | בעיה בהגדרות הכניסה עם Google. פנה למנהל המערכת |
| access_denied | הכניסה עם Google בוטלה |
| popup_closed_by_user | חלון הכניסה נסגר לפני השלמת התהליך |
| OAuth provider not enabled | הכניסה עם Google אינה זמינה כרגע |
| invalid_client | בעיה בהגדרות הלקוח של Google. פנה למנהל המערכת |
| Network error / fetch failed | בעיית תקשורת בכניסה עם Google |

### שינויים בקבצים
1. **קובץ חדש** `src/lib/authErrors.ts` — פונקציה `translateAuthError(error)` עם המילון
2. **עריכה** `src/pages/Login.tsx` — בכל 3 ה-`catch` להחליף `description: error.message` ב-`description: translateAuthError(error)`

### הערה חשובה
התרגום לא יפתור את שגיאת ה-`redirect_uri_mismatch` שאתה מתמודד איתה ב-Google OAuth — זו בעיית הגדרה שדורשת תיקון נפרד (מעבר ל-Managed OAuth או הוספת ה-callback URL הנכון של Lovable ב-Google Cloud Console). התרגום רק יציג את השגיאה בעברית במקום באנגלית.
