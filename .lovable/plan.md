
## תוספת לתכנית: תפקיד "עובד תפעול" (`operations`)

### תפקיד חדש
`operations` — עובד תפעול. גישת קריאה/ניהול לנכסים, עובדים, קטגוריות, משימות IT וניהול משתמשים, **בלי** גישה לשכר, חופשות, חברות, התראות והגדרות.

### מודל התפקידים המעודכן (6 תפקידים)
| תפקיד | תיאור |
|---|---|
| `super_admin` | בעל המערכת |
| `admin` | מנהל חברה |
| `direct_manager` | מנהל ישיר — כפיפים בלבד |
| `payroll` | חשב/ת שכר |
| `it_manager` | IT, נכסים, טפסי מסירה |
| **`operations`** (חדש) | עובד תפעול |
| `employee` | פורטל עובד |

---

### רשימת מסכים פר משתמש (מעודכן עם operations)

| מסך | super_admin | admin | direct_manager | payroll | it_manager | **operations** | employee |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| לוח בקרה | ✅ | ✅ | — | ✅ | ✅ | ✅ | — |
| **עובדים** | ✅ | ✅ | — | — | — | ✅ | — |
| **תיק עובד** | ✅ | ✅ | ✅ (כפיפים, ללא שכר) | ✅ (כולל שכר) | — | ✅ (ללא שכר) | — |
| **נכסים** | ✅ | ✅ | — | — | ✅ | ✅ | — |
| **קטגוריות** | ✅ | ✅ | — | — | — | ✅ | — |
| **משימות IT** | ✅ | ✅ | — | — | ✅ | ✅ | — |
| בקשות חופשה ומחלה | ✅ | ✅ | ✅ | ✅ | — | — | — |
| תיקוני שעון | ✅ | ✅ | ✅ | ✅ | — | — | — |
| שכר ותלושים | ✅ | ✅ | — | ✅ | — | — | — |
| חברות | ✅ | — | — | — | — | — | — |
| **ניהול משתמשים** | ✅ | ✅ | — | — | — | ✅ | — |
| התראות | ✅ | ✅ | — | — | ✅ | — | — |
| הגדרות | ✅ | ✅ | — | — | — | — | — |
| פורטל עובדים | — | — | ✅ | ✅ | ✅ | ✅ | ✅ |

**הפניית ברירת מחדל אחרי לוגין** עבור `operations` בלבד → `/employees`.

---

### הגדרת ההרשאות של `operations`
- **קריאה + עריכה מלאות** ל-`employees`, `assets`, `asset_categories`, `category_fields`, `it_tickets`, `digital_access`.
- **קריאה + ניהול תפקידים** ב-`user_roles` של החברה (כמו admin), **למעט** הענקה/שלילה של `super_admin`, `admin` ו-`payroll` — תפקידים רגישים שיישארו רק לאדמין.
- **אין גישה** לכלל: `leave_requests`, `attendance_records` (מעבר לצפייה כללית קיימת), `attendance_corrections`, `payslips`, `payslip_batches`, `companies`, `alerts` (כתיבה), הגדרות.

---

### שינויים נדרשים מעבר לתכנית הקיימת

**1. מיגרציה SQL — הוספה ל-enum `app_role`:**
```sql
ALTER TYPE app_role ADD VALUE 'operations';
```

**2. עדכון RLS policies:**
- `employees` — הוספת `operations` לכל ה-policies של admin (SELECT/INSERT/UPDATE/DELETE) בחברה.
- `assets` — אותו דבר.
- `asset_categories` + `category_fields` — אותו דבר.
- `it_tickets` — הוספת `operations` ל-`Admins and IT manage company tickets` (להפוך למדיניות אחת או להוסיף מדיניות חדשה).
- `digital_access` — אותו דבר.
- `user_roles` — מדיניות חדשה: `operations` יכול לראות/לערוך user_roles של החברה, אבל check מונע יצירה/שינוי לתפקידים `super_admin`, `admin`, `payroll`.
- `activity_log` — `operations` יכול ל-INSERT (כמו admin/it_manager).

**3. `src/hooks/useAuth.tsx`** — הוספת `isOperations`.

**4. `src/components/AppSidebar.tsx`** — הצגת הפריטים הרלוונטיים ל-`operations` לפי הטבלה.

**5. `src/App.tsx`** — הוספת `operations` ל-`requiredRoles` של:
- `/employees`, `/employees/:id`, `/assets`, `/categories`, `/it-tickets`, `/user-management`.

**6. `src/pages/Login.tsx`** — redirect ל-`/employees` עבור `operations` בלבד.

**7. `src/pages/UserManagement.tsx`:**
- תווית + צבע לתפקיד `operations` (טורקיז למשל).
- אם המשתמש הנוכחי הוא `operations` (ולא admin) — סינון רשימת התפקידים שניתן להעניק: רק `it_manager`, `direct_manager`, `operations`, `employee` (חוסם `admin`/`super_admin`/`payroll`).

**8. `src/pages/EmployeeDetail.tsx`** — עבור `operations`, להסתיר את לשונית התלושים ושדות שכר רגישים (כמו עבור `direct_manager`).

**9. `src/components/EditEmployeeDialog.tsx`** — סינון אופציות התפקיד בעת שיוך תפקיד למשתמש מקושר.

---

### קבצים מושפעים (תוספת לרשימת התכנית הקיימת)
- מיגרציה SQL נוספת — `operations` ל-enum + עדכוני RLS.
- `src/hooks/useAuth.tsx` (תוספת `isOperations`).
- `src/components/AppSidebar.tsx` (תוספת לוגיקת תפריט).
- `src/App.tsx` (`requiredRoles` מורחב).
- `src/pages/Login.tsx` (redirect).
- `src/pages/UserManagement.tsx` (סינון תפקידים).
- `src/pages/EmployeeDetail.tsx` (הסתרת שכר).
- `src/components/EditEmployeeDialog.tsx` (סינון).

כל שאר התכנית הקודמת (תפקידי `direct_manager`/`payroll`, `attendance_corrections`, מסכים `/payroll` ו-`/attendance-corrections`, אישור אוטומטי להצהרות מחלה, מייל לחשב שכר, דיאלוג סיכום תלוש) — נשארת כפי שאושרה.
