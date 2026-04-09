

# תוכנית: חיזוק מבנה היררכי רב-חברתי עם בורר חברות בכניסה

## סיכום

המערכת כבר כוללת את התשתית הבסיסית (טבלאות `companies`, `user_company_access`, `CompanyProvider`, `CompanySelector`). הבעיה העיקרית: **אין בידוד אמיתי ברמת ה-DB** — כל ה-SELECT policies הן `USING (true)`, והבורר חברות מופיע רק בתוך המערכת ולא בכניסה.

## מה ייעשה

### 1. חיזוק RLS — בידוד נתונים ברמת הדאטאבייס

עדכון מדיניות SELECT ב-10 טבלאות (`employees`, `assets`, `it_tickets`, `alerts`, `asset_categories`, `category_fields`, `digital_access`, `activity_log`, `announcements`, `knowledge_base`):

- **לפני:** `USING (true)` — כל משתמש רואה הכל
- **אחרי:** `USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())))` — משתמש רואה רק נתוני החברות שלו, סופר-אדמין רואה הכל

עדכון דומה גם ל-INSERT/UPDATE/DELETE policies שקיימות.

### 2. בורר חברות בכניסה למערכת

אחרי התחברות מוצלחת, במקום לנווט ישר לדשבורד:
- אם למשתמש **חברה אחת** — כניסה ישירה
- אם למשתמש **כמה חברות** — מסך ביניים לבחירת חברה פעילה
- **סופר-אדמין** — רואה את כל החברות לבחירה

ייווצר קומפוננט `CompanyPickerPage` שיוצג אחרי login לפני הכניסה ל-AppLayout.

### 3. עדכון ניתוב ב-Login

- אחרי `signInWithPassword` / `verifyOtp` / Google OAuth — ניווט ל-`/select-company` במקום `/`
- עמוד `/select-company` בודק כמה חברות יש למשתמש ומפנה בהתאם

### 4. עדכון ניהול משתמשים לפי חברה

- `UserManagement.tsx` — סינון משתמשים לפי `activeCompanyId` דרך `user_company_access`
- Edge Function `manage-users` — קבלת `company_id` כפרמטר וסינון בהתאם

---

### פרטים טכניים

**Migration — החלפת SELECT policies:**
```sql
-- דוגמה לטבלת employees (אותו דפוס ל-10 טבלאות)
DROP POLICY "Authenticated users can view employees" ON employees;
CREATE POLICY "Users view company employees" ON employees
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR company_id IN (SELECT user_company_ids(auth.uid())));
```

**קבצים חדשים:**
- `src/pages/SelectCompany.tsx` — מסך בחירת חברה

**קבצים שיעודכנו:**
- `src/App.tsx` — route חדש `/select-company`
- `src/pages/Login.tsx` — ניווט ל-`/select-company` אחרי התחברות
- `src/hooks/useCompany.tsx` — תמיכה ב-redirect אם אין חברה נבחרת
- `src/pages/UserManagement.tsx` — סינון לפי חברה פעילה
- `supabase/functions/manage-users/index.ts` — סינון לפי company_id

