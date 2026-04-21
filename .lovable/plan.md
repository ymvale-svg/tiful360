
## תכנית כוללת — מסך עובדים מאוחד

איחוד של כל ההחלטות שאושרו עד כה למסך אחד `/employees`: עובדים = משתמשים, אנשי קשר, כפיפות, ויבוא חכם מאקסל.

### מבנה המסך

`/employees` עם **שני טאבים**:

1. **טאב "עובדים"** (ברירת מחדל) — הטבלה הקיימת, עם עמודות חדשות:
   - **גישה למערכת** — ✓ פעיל + שם תפקיד / ⚠ אין חשבון + כפתור "צור חשבון"
   - **בקשר** — ✓/✗ (האם מופיע ברשימת אנשי הקשר)
   - **מנהל ישיר** — שם המנהל
2. **טאב "משתמשים ותפקידים"** — התוכן של `/user-management` הקיים (משתמשים שאינם עובדים: super_admin, IT חיצוני וכד'), עם הזמנת משתמש, ייבוא, וניהול תפקידים/גישה.

הסרת "ניהול משתמשים" מהסיידבר. `/user-management` נשאר כ-redirect ל-`/employees?tab=users`.

### שינויים במסד הנתונים (מיגרציה אחת)

ב-`employees`:
- `exclude_from_contacts boolean NOT NULL DEFAULT false` — דגל הסתרה מאנשי הקשר.
- `contact_sort_order integer NULL` — סדר תצוגה ידני באנשי הקשר.

VIEW חדש `public.company_contacts_view`:
- בוחר רק עמודות "ציבוריות" (`id, full_name, role, department, phone, email, company_id`) מעובדים פעילים שאינם מסומנים להסתרה.
- מאפשר לכל משתמש בחברה לראות פרטי קשר בלבד, בלי לחשוף `id_number / michpal_code / balances`.

`portal_contacts` נשארת לאנשי קשר **חיצוניים** בלבד (ספקים/יועצים).

### דיאלוג "הוסף עובד"

- שדות קיימים נשארים. **`email` הופך לחובה.**
- שדה חדש **תפקיד מערכת** (`app_role`) — ברירת מחדל `employee`. operations חסום מ-`admin/payroll/super_admin`.
- צ'קבוקס **"שלח הזמנה במייל"** (default on).
- צ'קבוקס **"אל תכלול ברשימת אנשי הקשר"** (default off).
- שדה **"מנהל ישיר"** (קיים).

זרימה:
1. INSERT ל-`employees`.
2. אם הוזמן — קריאה ל-edge function `manage-users` (`action=invite`) עם email/full_name/role/company_id.
3. UPDATE `employees.linked_user_id` ל-user_id שחזר.
4. כישלון בשלב 2/3 → טוסט שגיאה, העובד נשאר, אפשר לנסות שוב מ"ערוך".

### דיאלוג "ערוך עובד"

הוספה לכל השדות הקיימים:
- **מנהל ישיר** — `SearchableSelect` של עובדי החברה (לא כולל את העובד עצמו), אפשרות "ללא".
- **אל תכלול ברשימת אנשי הקשר** — צ'קבוקס.
- **בלוק "גישה למערכת"**:
  - אם יש `linked_user_id`: תפקיד נוכחי + כפתור "שנה תפקיד".
  - אם אין: כפתור "צור חשבון משתמש" (שולח הזמנה לפי המייל הקיים).

### ייבוא מאקסל (`mode=employees`)

תבנית מורחבת:

| email* | full_name* | employee_code | id_number | department | role | system_role | direct_manager | exclude_from_contacts | birth_date | start_date | phone |

לוגיקה:
- ולידציה: `email` חובה, `system_role` חייב להיות תפקיד חוקי (ברירת מחדל `employee`), הרשאות operations נאכפות.
- **מנהל ישיר**: lookup לפי `full_name` או `employee_code` מול עובדים קיימים בחברה. אם לא נמצא — אזהרה ב-preview, השורה מיובאת בלי מנהל.
- **Self-reference בקובץ**: סבב שני אחרי INSERT שמקשר מנהלים שמופיעים באותו קובץ.
- **הזמנה אוטומטית**: לכל עובד שיובא — קריאה ל-`manage-users invite` ועדכון `linked_user_id`. כישלונות נאספים לסיכום בסוף.
- **`exclude_from_contacts`** נשמר ישירות.

תבנית "הורד תבנית" משתנה לפי `mode` (employees vs users).

### אנשי קשר בפורטל

- hook חדש `useCompanyContacts` ב-`useData.ts` שמחזיר רשימה ממוזגת:
  1. רשומות מ-`company_contacts_view` (עובדים פעילים שלא הוסתרו).
  2. רשומות מ-`portal_contacts` (אנשי קשר חיצוניים).
- מיון: `contact_sort_order`, אחר כך `department` ואז `full_name`.
- כל מקום שהיום קורא ל-`portal_contacts` בפורטל מתחלף לקריאה ל-hook הזה.

### `PortalSettingsTab`

- הסקציה הנוכחית של "אנשי קשר" משנה כותרת ל-**"אנשי קשר חיצוניים"**, עם הסבר: *"עובדי החברה מופיעים אוטומטית. כאן ניתן להוסיף ספקים/יועצים בלבד."*
- קישור "לניהול עובדים → /employees".

### קבצים מושפעים

| קובץ | שינוי |
|---|---|
| מיגרציה | עמודות + VIEW + policy |
| `src/pages/Employees.tsx` | טאבים, עמודות חדשות, כפתור "צור חשבון" בשורה |
| `src/pages/UserManagement.tsx` | הופך ל-`UsersAndRolesTab` (export בנוסף ל-default) |
| `src/components/AddEmployeeDialog.tsx` | email חובה, system_role, צ'קבוקס הזמנה, צ'קבוקס exclude, קריאה ל-manage-users |
| `src/components/EditEmployeeDialog.tsx` | מנהל ישיר, exclude, בלוק גישה למערכת |
| `src/components/ImportExcelDialog.tsx` | תבנית employees מורחבת + הזמנה אוטומטית + lookup מנהל; מצב users מלא |
| `src/components/AppSidebar.tsx` | הסרת פריט "ניהול משתמשים" |
| `src/App.tsx` | redirect `/user-management` → `/employees?tab=users` |
| `src/components/PortalSettingsTab.tsx` | rename + הסבר + קישור |
| `src/hooks/useData.ts` | hook חדש `useCompanyContacts` |
| `src/pages/EmployeePortal.tsx` (וכל מסך אנשי קשר) | מעבר ל-hook החדש |

### הערות

- אין מחיקה של `portal_contacts` — נשארת לתכלית אנשי קשר חיצוניים.
- אין אכיפת מניעת מעגלי כפיפות בשלב הזה.
- כל הזרימות אטומיות ככל הניתן: כישלון בהזמנה לא מבטל את יצירת העובד, אך מסומן בבירור למשתמש כדי שיוכל לתקן.
