## תכנית

### 1. עדכון שתי הקטגוריות הקיימות
מיגרציה ל־DB שמסמנת את "ציוד עזר" ו"גישה דיגיטלית" עם:
- `skip_handover_form = true`
- `skip_return_form = true`

כך פריטים בקטגוריות אלו ישויכו / יוחזרו ישירות, ללא טופס מסירה/החזרה וללא דיאלוג חתימת עובד (הלוגיקה כבר קיימת ב־`AssignAssetWithFormDialog` דרך `categorySkipsHandover`).

### 2. הוספת אופציה במחולל קטגוריות חדשות
ב־`src/pages/CategoryManager.tsx` → רכיב `NewCategoryDialog`:
- הוספת שני מתגי checkbox (כמו שכבר קיימים ב־`CategoryEditor`):
  - "דלג על אישור משיכה (ללא טופס וחתימת עובד)"
  - "דלג על אישור זיכוי (ללא טופס החזרה וחתימה)"
- העברת הערכים ל־`createMutation.mutateAsync` כ־`skip_handover_form` ו־`skip_return_form`.
- הרחבת ה־`mutationFn` ב־`useCreateCategory` (`src/hooks/useCategories.ts`) כך שיקבל ויעביר את שני השדות החדשים ל־insert.

### קבצים שיעודכנו
- מיגרציית SQL חדשה (עדכון שתי הקטגוריות)
- `src/hooks/useCategories.ts` — תמיכה בשדות ב־create
- `src/pages/CategoryManager.tsx` — checkboxים בדיאלוג קטגוריה חדשה
