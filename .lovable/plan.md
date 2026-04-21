
## תוכנית מקיפה: ארגון מסך "שכר ותלושים" + ניקוי קוד מת

### חלק א' — מבנה סופי של `/payroll`

מסך אחד עם 4 טאבים, deep-link דרך `?tab=`:

| טאב | key | תוכן |
|---|---|---|
| סקירה | `overview` (ברירת מחדל) | KPIs, אצוות אחרונות (6), מחלות/חופשות פעילות, תיקוני שעון פתוחים, **כפתור "העלאת אצוות תלושים"** + empty-state CTA |
| ניהול תלושים | `batches` | רשימת כל האצוות עם פילטר חודש/שנה, תלושים לא משויכים (`useUnmatchedPayslips`) עם הקצאה ידנית, מחיקה |
| תלושי עובד | `employee` | בחירת עובד + `<EmployeePayslipsTab />` |
| הגדרות שכר | `settings` | שדה `payroll_emails` (מופרד פסיקים), וולידציה, שמירה ל-`companies.payroll_emails` |

### חלק ב' — הסרה מ-`/settings`

#### `src/pages/Settings.tsx`
- הסרת טאב "תלושי שכר" אם נותר.
- מתוך `GeneralSettings` (טאב "כללי"):
  - מחיקת state `payrollEmails` + סנכרון מה-query.
  - מחיקת בלוק JSX של השדה (label + input + הסבר).
  - מחיקת לוגיקת validate emails.
  - הסרת `payroll_emails` מ-payload של `updateMutation`.

### חלק ג' — ניקוי קוד מת

#### ב-`src/pages/Settings.tsx`
- imports שלא בשימוש: `PayslipsUploadDialog`, `usePayslipBatches`, `useUnmatchedPayslips`, אייקונים שהיו רק לבלוקים שהוסרו (`Upload`, `FileText` וכו').
- פונקציות עזר שנשארו יתומות (validate email helper) — להעביר ל-`/payroll` או למחוק אם משוכפלות.

#### ב-`src/pages/Payroll.tsx`
- וידוא שאין כפילות בין `OverviewTab` ל-`BatchesTab` בשליפת `usePayslipBatches` (למשל key/limit שונים במקום אחד מקור).
- מחיקת imports יתומים שנותרו מאיטרציות קודמות.

#### חיפוש כללי בפרויקט
- `grep` ל-`payroll_emails` — לוודא שהשימוש היחיד הוא ב-`/payroll` ובקריאות edge functions.
- `grep` ל-`PayslipsUploadDialog` — שייובא רק במקומות הרלוונטיים (`Payroll.tsx`).
- הסרת תרגומים/מחרוזות יתומות אם קיים קובץ i18n.

### חלק ד' — הרשאות (ללא שינוי, וידוא בלבד)

- `/payroll`: `admin`, `super_admin`, `payroll`
- `/settings`: `admin`, `super_admin`
- חשב שכר מקבל גישה מלאה לכל מה שצריך מתוך `/payroll`.

### קבצים מושפעים

| קובץ | שינוי |
|---|---|
| `src/pages/Payroll.tsx` | מבנה 4 טאבים סופי, כפתור Upload בסקירה + empty-state, טאב "הגדרות שכר" |
| `src/pages/Settings.tsx` | הסרה מלאה של תלושים/payroll_emails + ניקוי imports |

### הערות
- אין שינוי DB / hooks / edge functions.
- לאחר ביצוע — בדיקה ידנית: `/payroll?tab=settings` עובד, שמירת אימיילים מעדכנת את ה-DB, התראות חופשה/מחלה ממשיכות להישלח לכתובות שהוגדרו.
