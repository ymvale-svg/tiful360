

## הסתרת טאב "תלושי שכר" — רק לאדמין/סופר אדמין/חשב שכר/העובד עצמו

### דרישה
טאב "תלושי שכר" בכרטיס העובד יוצג רק ל:
- **סופר אדמין** (`super_admin`)
- **אדמין** (`admin`)
- **חשב שכר** (`payroll`)
- **העובד עצמו** (כשצופה בכרטיס שלו)

לכל היתר (`it_manager`, `operations`, `direct_manager`) — הטאב מוסתר לחלוטין.

### שינוי

**קובץ**: `src/pages/EmployeeDetail.tsx`

1. לקרוא `isAdmin`, `isSuperAdmin`, `isPayroll`, `user` מ-`useAuth()`.
2. לחשב הרשאה:
   ```ts
   const canSeePayslips =
     isSuperAdmin || isAdmin || isPayroll ||
     employee?.linked_user_id === user?.id;
   ```
3. רינדור מותנה — להציג את `TabsTrigger` ואת `TabsContent` של "תלושי שכר" רק כש-`canSeePayslips === true`.
4. אם הטאב הפעיל הוא `payslips` ואין הרשאה — להחליף ל-tab ברירת מחדל (פרטים אישיים).

### הגנת backend (קיימת)
RLS על טבלת `payslips` כבר מגביל גישה — ההסתרה ב-UI היא משלימה בלבד.

### קבצים מושפעים
| קובץ | שינוי |
|---|---|
| `src/pages/EmployeeDetail.tsx` | בדיקת הרשאה + הסתרה מותנית של טאב תלושי שכר |

### בדיקה
1. כניסה כ-`super_admin` / `admin` / `payroll` → הטאב מופיע לכל עובד.
2. כניסה כ-`it_manager` / `operations` / `direct_manager` → הטאב לא מופיע.
3. כניסה כעובד רגיל → הטאב מופיע רק בכרטיס שלו.

