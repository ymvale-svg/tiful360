
## משימות שנותרו להשלמת התכנית

### 1. דיאלוג "הוסף עובד" (`AddEmployeeDialog.tsx`)
- הפיכת שדה **email לחובה**.
- הוספת שדה **תפקיד מערכת** (`app_role`) — ברירת מחדל `employee`, עם חסימת `admin/payroll/super_admin` למשתמשי operations.
- צ'קבוקס **"שלח הזמנה במייל"** (default on).
- צ'קבוקס **"אל תכלול ברשימת אנשי הקשר"** (default off).
- זרימת יצירה: INSERT עובד → קריאה ל-`manage-users` (action=invite) → UPDATE `linked_user_id`. כישלון בהזמנה ≠ ביטול יצירת העובד.

### 2. ייבוא מאקסל (`ImportExcelDialog.tsx`, mode=employees)
- הרחבת התבנית: `email*`, `system_role`, `direct_manager`, `exclude_from_contacts`.
- ולידציה: email חובה, system_role חוקי, אכיפת הרשאות operations.
- **lookup מנהל ישיר** לפי `full_name`/`employee_code` בעובדי החברה הקיימים, עם אזהרה ב-preview אם לא נמצא.
- **סבב שני (self-reference)** לקישור מנהלים שמופיעים באותו קובץ הייבוא.
- **הזמנה אוטומטית** לכל עובד מיובא + עדכון `linked_user_id`, סיכום כישלונות בסוף.
- עדכון תבנית "הורד תבנית" לפי mode.

### 3. אנשי קשר בפורטל
- **hook חדש `useCompanyContacts`** ב-`src/hooks/useData.ts` — שילוב של `get_company_contacts(company_id)` (עובדים פעילים שלא הוסתרו) + `portal_contacts` (אנשי קשר חיצוניים), עם מיון `contact_sort_order` → `department` → `full_name`.
- החלפת כל קריאה ישירה ל-`portal_contacts` בפורטל (`EmployeePortal.tsx` וכל מסך אנשי קשר נוסף) ב-hook החדש.

### 4. `PortalSettingsTab.tsx`
- שינוי כותרת הסקציה ל-**"אנשי קשר חיצוניים"**.
- הוספת טקסט הסבר: *"עובדי החברה מופיעים אוטומטית. כאן ניתן להוסיף ספקים/יועצים בלבד."*
- קישור ניווט: **"לניהול עובדים → /employees"**.

### קבצים שיושפעו
- `src/components/AddEmployeeDialog.tsx`
- `src/components/ImportExcelDialog.tsx`
- `src/hooks/useData.ts`
- `src/pages/EmployeePortal.tsx` (וכל מסך נוסף שמציג אנשי קשר)
- `src/components/PortalSettingsTab.tsx`

### מה כבר בוצע (לא חוזר על עצמו)
מיגרציית DB (`exclude_from_contacts`, `contact_sort_order`, `get_company_contacts`), טאבים ב-`Employees.tsx` עם עמודות חדשות, `EditEmployeeDialog` (מנהל ישיר + exclude + בלוק גישה), פיצול ל-`UsersAndRolesTab`, redirect מ-`/user-management`, תיקון state חסר.
