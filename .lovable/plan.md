

## הוספת משתמשים חיצוניים (לא משויכים לעובד) במסך משתמשים ותפקידים

### מה חסר
כיום במסך **ניהול עובדים ומשתמשים → משתמשים ותפקידים** ניתן להגדיר משתמשים רק מתוך רשימת העובדים הקיימת. נדרש להוסיף אפשרות להזמין משתמש חיצוני (כגון איש IT, רואה חשבון, יועץ חיצוני) שיש לו גישה למערכת בתפקיד מסוים, **בלי** שתיווצר עבורו רשומת עובד.

### זרימת המשתמש

1. בטאב **"משתמשים ותפקידים"** יתווסף כפתור חדש: **"הזמן משתמש חיצוני"** (ליד / בנוסף לכפתור הקיים שמשייך משתמש לעובד).
2. לחיצה פותחת דיאלוג עם השדות:
   - שם מלא
   - אימייל
   - תפקיד במערכת (Select: admin / it_manager / payroll / operations / direct_manager) — **ללא** האופציה `employee` (זו דרך מיועדת לחיצוניים בלבד).
   - גישה לחברות: בחירת חברה אחת או יותר (multi-select של החברות שלמשתמש הפעיל יש גישה אליהן; super_admin רואה הכל).
3. שליחה → קריאה ל-edge function `manage-users` (שכבר קיימת) במצב "צור משתמש חיצוני":
   - יוצרת משתמש ב-Auth (עם invite email).
   - יוצרת `profiles`.
   - מקצה את התפקיד ב-`user_roles`.
   - מקצה גישה לחברות שנבחרו ב-`user_company_access`.
   - **לא** יוצרת רשומה ב-`employees`.
4. בטבלת המשתמשים, לצד כל משתמש תוצג עמודה / תגית **"סוג"**: "עובד" או "חיצוני", כדי להבחין ביניהם.

### שינויים טכניים

**1. UI חדש**
- `src/components/InviteExternalUserDialog.tsx` (חדש) — דיאלוג עם הטופס המתואר. שימוש ב-`useCompany` כדי לטעון רשימת חברות זמינות.

**2. עדכון קובץ קיים**
- `src/components/UsersAndRolesTab.tsx`:
  - כפתור "הזמן משתמש חיצוני" שפותח את הדיאלוג החדש.
  - בטבלת המשתמשים — עמודת "סוג": "חיצוני" אם אין `employee` עם `linked_user_id` שווה ל-`user_id` של המשתמש (אחרת "עובד").
  - אפשרות להסיר משתמש חיצוני (מחיקת `user_roles` + `user_company_access` דרך `manage-users`).

**3. עדכון Edge Function**
- `supabase/functions/manage-users/index.ts`:
  - הוספת action חדש `invite_external_user` שמקבל: `email, full_name, role, company_ids[]`.
  - מבצע: `auth.admin.inviteUserByEmail` → יצירת `profiles` (אם לא נוצרה אוטומטית) → upsert ל-`user_roles` עם התפקיד שנבחר (במקום ה-default `employee`) → insert ל-`user_company_access` לכל חברה שנבחרה.
  - בדיקת הרשאות: רק `super_admin` או `admin` של החברה הרלוונטית רשאים להזמין.

**4. ללא שינוי DB**
- אין צורך במיגרציות — הטבלאות `user_roles`, `user_company_access`, `profiles` כבר תומכות בכך. ההבחנה "חיצוני" היא בפועל "אין רשומת employee מקושרת" — נגזרת מהנתונים.

### קבצים מושפעים
- `src/components/UsersAndRolesTab.tsx` (עדכון)
- `src/components/InviteExternalUserDialog.tsx` (חדש)
- `supabase/functions/manage-users/index.ts` (עדכון — action חדש)

### מה לא משתנה
- זרימת שיוך משתמש לעובד הקיים — נשארת כמות שהיא.
- מבנה ה-DB.
- שאר ההרשאות והמסכים.

