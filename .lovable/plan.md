# הפעלת כפתור "התחל שיוך" (שיוך מהיר)

כיום שני הכפתורים — "שיוך מהיר" בסרגל החיפוש ו"התחל שיוך" בכרטיס ה-CTA בתחתית `DomainsGrid` — רק מציגים toast "אשף ייעודי בקרוב". המטרה: להפעיל אותם לשיוך אמיתי, תוך שימוש מקסימלי ברכיב הקיים `AssignAssetWithFormDialog` שכבר תומך בבחירת עובד, טופס מסירה, חתימת מנהל בנוכחות, או שליחה לפורטל.

## הזרימה המוצעת (אשף בשני שלבים)

**שלב 1 — בחירת עובד ופריט/ים** (דיאלוג חדש קליל `QuickAssignDialog`):
- שדה עובד (SearchableSelect מתוך `useEmployees`).
- שדה פריט עם חיפוש (SearchableSelect מתוך `useAssets`) — מסונן ל-`status = available` ולעובד יעד מאותה חברה.
- אפשרות "הוסף פריט נוסף" → רשימת פריטים שנבחרו (chips עם הסרה).
- כפתור ראשי: "המשך לשיוך" (disabled עד שיש עובד + פריט אחד לפחות).

**שלב 2 — חתימה/מסירה לכל פריט**:
- אם נבחר פריט יחיד → לפתוח את `AssignAssetWithFormDialog` הקיים עם ה-asset וה-`preassignedOwnerId` (מועבר דרך עדכון `current_owner_id` זמני? לא — נוסיף prop אופציונלי `defaultEmployeeId`).
- אם נבחרו כמה פריטים → נריץ אותם בתור: לאחר סיום שיוך אחד (`onOpenChange(false)` עם success) פותחים את הבא אוטומטית. בראש הדיאלוג נציג מחוון "פריט 2 מתוך 4".

## שינויי קוד

1. **`src/components/AssignAssetWithFormDialog.tsx`**
   - הוספת prop אופציונלי `defaultEmployeeId?: string` שמאכלס את `employeeId` כשנפתח (אם אין `preassignedOwnerId`).
   - הוספת prop אופציונלי `onAssigned?: () => void` שייקרא לאחר שיוך מוצלח (לשרשור הבא ב-batch).

2. **`src/components/QuickAssignDialog.tsx`** (קובץ חדש, ~150 שורות)
   - דיאלוג שלב 1 כפי שתואר למעלה.
   - מנהל תור פריטים נבחרים ופותח את `AssignAssetWithFormDialog` עבור כל אחד בתורו.

3. **`src/pages/Assets.tsx`**
   - הוספת state `quickAssignOpen`.
   - להחליף את שני ה-`toast(...)` בקריאה ל-`setQuickAssignOpen(true)`.
   - לרנדר `<QuickAssignDialog open={quickAssignOpen} onOpenChange={setQuickAssignOpen} />` בתחתית.

## מה לא משתנה
- לוגיקת ה-PDF, החתימות, ברירת המחדל "חתימה מול מנהל התפעול", שליחה לפורטל, או טבלאות ה-DB.
- כפתור "פריט חדש" וכפתורי הייצוא/ייבוא.
- הכרטיס בתחתית `DomainsGrid` נשאר ויזואלית זהה — רק ה-handler יעבוד.

## הערכת היקף
~200 שורות חדשות (רובן בקובץ חדש), שינויים נקודתיים בשני קבצים קיימים. ללא מיגרציות.
