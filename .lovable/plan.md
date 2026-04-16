

## תוכנית: הגנה על מידע PII בטבלת employees

### הבעיה
כל משתמש מאומת השייך לחברה יכול לקרוא את כל העמודות בטבלת `employees`, כולל `id_number` (תעודת זהות), `birth_date`, `phone`, `email`. זה חושף מידע אישי רגיש לכל עובד בחברה.

### הגישה
יצירת View שמחביא את השדות הרגישים, והגבלת גישה ישירה לטבלה רק לאדמינים ו-IT.

### שינויים

**1. מיגרציה (SQL)**
- יצירת View בשם `employees_public` עם `security_invoker=on` שמכיל את כל העמודות **חוץ מ-** `id_number`, `birth_date`, `phone`, `email`
- שינוי ה-SELECT policy של `employees`:
  - אדמינים ו-IT managers רואים הכל (כמו היום)
  - עובדים רגילים — `USING (false)` על הטבלה הישירה
- הוספת SELECT policy על ה-View (כל משתמשי החברה יכולים לקרוא)

**2. קוד — שינויים בקבצים**

| קובץ | שינוי |
|---|---|
| `src/hooks/useData.ts` — `useEmployees()` | שאילתה מ-`employees_public` במקום `employees` |
| `src/pages/Employees.tsx` | הסרת עמודות `id_number`, `birth_date`, `phone`, `email` מהטבלה (יוצגו רק לאדמינים בדף פרטי עובד) |
| `src/pages/EmployeeDetail.tsx` | שאילתה מ-`employees` (ישירות) — נגיש רק לאדמין/IT בזכות ה-RLS |
| `src/pages/EmployeePortal.tsx` | שאילתת `birth_date` — צריך לעבור לפונקציית DB מסוג `security_definer` שמחזירה רק ימי הולדת בחודש הנוכחי |
| `src/components/OffboardingDialog.tsx` | כבר עובד עם עובד ספציפי — אדמין בלבד, בסדר |

**3. פונקציית DB חדשה**
- `get_company_birthdays(_company_id uuid)` — `SECURITY DEFINER`, מחזירה `id, full_name, birth_date` רק לעובדים פעילים עם יום הולדת בחודש הנוכחי. מונעת חשיפה גורפת של תאריכי לידה.

### פרטים טכניים

```text
┌─────────────────┐
│   employees     │  ← RLS: SELECT only for admin/IT + super_admin
│ (full table)    │  ← Used by: EmployeeDetail, OffboardingDialog, mutations
└────────┬────────┘
         │
┌────────▼────────┐
│ employees_public│  ← View (no id_number, birth_date, phone, email)
│ (security_inv.) │  ← RLS inherited from base table — but base denies non-admin
└─────────────────┘     So view needs its own permissive policy via GRANT
```

### תוצאה
- עובדים רגילים רואים רשימת עובדים **ללא** תעודת זהות, טלפון, מייל ותאריך לידה
- אדמינים ו-IT רואים הכל בדף פרטי עובד
- ימי הולדת בפורטל עובדים — רק החודש הנוכחי, דרך פונקציה מאובטחת

