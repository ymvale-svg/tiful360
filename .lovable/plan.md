## תוכנית: קיבוץ ידני של פריטים תחת "קבוצה" בתת-קטגוריה

### המצב היום
המערכת כבר מקבצת אוטומטית פריטים תחת כרטיס-אב לפי `asset_name` (ראה `getGroupKey` ב-`src/lib/assetDomains.ts`). לכן ב-screenshot שלך `ZTE MC888` ו-`ראוטר סלולארי` הם שני כרטיסים נפרדים — שמותיהם שונים.

### המטרה
לאפשר למנהל להגדיר **קבוצה ידנית** בתוך תת-קטגוריה (למשל "ראוטרים סלולאריים"), לשייך אליה פריטים קיימים, ולהציג אותה ככרטיס-אב יחיד עם מונה כולל + כמה בשימוש. לחיצה פותחת את רשימת כל הפריטים בקבוצה (כרטיס נפרד לכל אחד).

### שינויי DB (migration)

1. **טבלה חדשה `asset_groups`**:
   - `id`, `company_id`, `category_id` (FK ל-`asset_categories`)
   - `name` (שם הקבוצה, למשל "ראוטרים סלולאריים")
   - `description` (אופציונלי), `sort_order`, `created_at`, `updated_at`
   - אילוץ ייחודיות: `(category_id, name)`
   - RLS מקביל ל-`asset_categories` (admin/operations מנהלים, כולם רואים בחברה שלהם)

2. **`assets`**: הוספת עמודה `group_id uuid` (nullable, FK רך ל-`asset_groups`).
   - פריט בלי `group_id` ממשיך להתנהג כמו היום (קיבוץ לפי `asset_name`).

### שינויי לוגיקה

3. **`src/lib/assetDomains.ts` → `getGroupKey`**: אם ל-asset יש `group_id` שמופה לקבוצה קיימת — להחזיר את שם הקבוצה (קידומת `g:<groupId>`). אחרת ליפול ל-fallback הקיים (asset_name / coverage type).
   - הפונקציה תקבל גם `groupsById?: Map<string, {name:string}>`.

4. **`src/hooks/useData.ts`** או hook חדש `useAssetGroups.ts`:
   - `useAssetGroups()` — שליפת כל הקבוצות של החברה.
   - `useCreateGroup / useUpdateGroup / useDeleteGroup`.
   - `useAssignAssetsToGroup(groupId, assetIds[])` — bulk update.

### שינויי UI

5. **`CategoryManager.tsx`**: בתוך כל תת-קטגוריה (accordion item) — הוספת בלוק "קבוצות" עם:
   - כפתור "קבוצה חדשה" → דיאלוג `NewGroupDialog` (שם + תיאור).
   - רשימת קבוצות קיימות עם פעולות: ערוך / מחק / נהל פריטים.

6. **`ManageGroupItemsDialog.tsx`** (חדש): רשימה דו-עמודתית של כל הפריטים בתת-הקטגוריה — בצד אחד "בקבוצה", בצד שני "ללא קבוצה" — עם תיבות סימון להעברה ושמירה.

7. **`AssetsDomainPage.tsx`**:
   - לטעון `useAssetGroups()` ולהעביר ל-`getGroupKey`.
   - כרטיס-האב (`ParentCard`) של קבוצה ידנית יציג: שם הקבוצה + מונה כולל + תת-תווית "X בשימוש מתוך Y" (קיים `total`+`activeCount` — רק לעדכן את הטקסט).
   - לחיצה על הכרטיס תפתח את הרשימה הקיימת (`InstancesTable`) של כל הפריטים בקבוצה — כל אחד כשורה/כרטיס נפרד שניתן ללחוץ עליו ולהיכנס לפרטים.

8. **`AddAssetDialog` / `EditAssetDialog`**: שדה אופציונלי "קבוצה" (select של קבוצות תת-הקטגוריה הנבחרת + "ללא קבוצה").

### מה לא משתנה
- 6 הדומיינים הקשיחים, האייקונים, הצבעים, ה-`asset_code` האוטומטי, טפסי handover/return, וההתראות.
- הקיבוץ האוטומטי לפי `asset_name` נשאר כ-fallback לפריטים בלי `group_id`.

### Rollout
- ללא backfill — קבוצות נוצרות ידנית לפי הצורך.
- אם תתקבל אישור, אני אריץ קודם את ה-migration, ואז אבנה את ה-UI לפי הסדר 3→7.