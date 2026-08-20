# מסך משאבים — יישור מלא להיררכיה דומיין ← קטגוריה ← תת-קטגוריה

## מוקד אמת אחד

מקור האמת היחיד להיררכיה:

```text
domain            = asset_categories.domain            (6 ערכים קבועים)
category          = asset_categories                   (רמה אמצעית)
sub-category      = asset_groups (category_id)         (רמה תחתונה)
item              = assets (category_id + group_id)
```

כל מסך, דיאלוג, PDF ופונקציית שרת חייבים לגזור את השיוך מ-`assets.group_id` בלבד — לא משם הפריט, לא משדה מותאם, לא מ-prefix.

## ממצאי הסריקה (מה לא מיושר היום)

1. **`getGroupKey` ב-`src/lib/assetDomains.ts` — הפרה מרכזית.** כשאין `group_id` הוא נופל ל-`asset_name` (ולביטוח ל-`custom_fields["סוג כיסוי"]`), ויוצר "תת-קטגוריות רפאים". בנתונים: 23 מתוך 127 פריטים בלבד משויכים בפועל; "ציוד עזר" (29), "גישה דיגיטלית" (25), "שירותי מנוי" (19), "תוכנות" (15), "מחשבים ניידים" (11) — ללא שיוך כלל.
2. **שני מסכי דריל-דאון מקבילים** — `/assets?cat=` ← `CategoryAssetsList` (מקבץ נכון לפי `group_id`) מול `/assets/:domain` ← `AssetsDomainPage` (קיבוץ אוטומטי לפי שם). שני מקורות אמת ויזואליים לאותם נתונים.
3. **פרמטרי URL מטעים** — ב-`AssetsDomainPage` ו-`DomainsGrid` הפרמטר `sub` מחזיק **מזהה קטגוריה**, והפרמטר `group` מחזיק **מחרוזת שם** ולא מזהה. בכרטיס הדומיין הצ׳יפים הם קטגוריות אך הטקסט אומר "הוסף תת-קטגוריה ראשונה".
4. **קישורים ישנים** — `ExpiringAssetsCard` מנווט ל-`/assets?cat=…&asset=…`; `DomainsGrid` מנווט ל-`?sub=<categoryId>`.
5. **שני מנגנוני ניהול תת-קטגוריות** — `ManageGroupsDialog` מול היצירה המוטבעת ב-`CategoryManager` ו-`SubCategorySelect`. התנהגות ומונחים שונים במעט.
6. **תת-קטגוריות ריקות נעלמות** — הקיבוץ נגזר מהפריטים בלבד.
7. **מה כן מיושר (לא נוגעים)** — תהליך הקליטה (`NewOnboardingDialog`, `OnboardingChecklist`) כבר עובד מול `asset_groups`/`selected_group_id`; `AddAssetDialog`/`EditAssetDialog` כבר משתמשים ב-`SubCategorySelect` ו-`AddAssetDialog` כבר מחייב בחירה כשקיימות תת-קטגוריות.

## מה נבנה

### 1. `getGroupKey` → מקור אמת יחיד
פונקציה חדשה `resolveSubCategory(asset, groups)` שמחזירה את התת-קטגוריה מ-`group_id` בלבד, או `null` = "ללא תת-קטגוריה". הנפילה לשם/שדה מותאם תוסר לחלוטין, וכל הקוראים יעודכנו.

### 2. מסך אחד, שלוש רמות
`/assets` (דומיינים) ← `/assets/:domain?cat=<categoryId>` ← `&sub=<groupId>` ← `/assets/:domain/:itemId`.

- מסך ראשי: כרטיסי דומיין; צ׳יפים = **קטגוריות** (מונח מתוקן) עם מונה תת-קטגוריות ופריטים.
- מסך דומיין: קטגוריות; בכל קטגוריה כרטיסי תת-קטגוריות **מתוך `asset_groups`**, כולל ריקות (מונה 0).
- כרטיס קבוע "ללא תת-קטגוריה" עם תג אזהרה, כשיש פריטים לא-משויכים.
- דריל-דאון לתת-קטגוריה = טבלת מופעים (כולל תצוגות רכב/ביטוח הקיימות).
- `CategoryAssetsList` והנתיב `?cat=`/`?asset=` ב-`Assets.tsx` יוסרו; `ExpiringAssetsCard`, החיפוש הגלובלי וכל שאר הלינקים ינותבו לנתיב החדש.

### 3. שיוך וניהול מתוך המסך
- "＋ תת-קטגוריה" בראש כל קטגוריה — יצירה מיידית דרך `useCreateAssetGroup`, בירושת אחראי ברירת מחדל.
- בחירה מרובה בטבלה ← "שייך לתת-קטגוריה" (`useAssignAssetsToGroup`) לניקוי הפריטים הלא-משויכים.
- `ManageGroupsDialog` יאוחד סביב אותם רכיבים/מונחים (או ייקרא מתוך המסך החדש) כדי שלא יישארו שני מנגנונים.

### 4. עקביות מונחים ותצוגה
- "תת-קטגוריה" לרמה התחתונה בלבד; "קטגוריה" לרמה האמצעית; "דומיין" לעליונה — בכל הקבצים שנסרקו.
- פירורי לחם אחידים: דומיין / קטגוריה / תת-קטגוריה / פריט.
- אחראי מוצג לפי `resolveOwnerRole` (תת-קטגוריה ← קטגוריה ← ברירת מחדל) בכל מקום שמציג אחראי.
- מוני "פגי תוקף"/"משויכים" מחושבים מאותה היררכיה בכל שלוש הרמות.

## פרטים טכניים

- ישתנו: `src/lib/assetDomains.ts`, `src/pages/Assets.tsx`, `src/pages/AssetsDomainPage.tsx`, `src/components/assets/DomainsGrid.tsx`, `src/components/ExpiringAssetsCard.tsx`, `src/components/ManageGroupsDialog.tsx`, ותיקוני מונחים ב-`CategoryManager.tsx`.
- יוסר: `src/components/assets/CategoryAssetsList.tsx`.
- ללא שינוי סכימה — `asset_groups.category_id` ו-`assets.group_id` כבר קיימים ותקינים.
- ללא מיגרציית נתונים אוטומטית: 104 הפריטים הלא-משויכים יופיעו תחת "ללא תת-קטגוריה" וישויכו דרך השיוך המרובה. (אפשר להוסיף המרה חד-פעמית לפי שם פריט בבקשה נפרדת.)
