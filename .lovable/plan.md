# תכנון מחדש — מסך נכסים וציוד

## מטרה
מסך היררכי בגישת drill-down במקום טבלה עמוסה עם סינון/מיון.

## ניווט (3 רמות, נשמר ב-URL)

```
/assets                              → רמה 1: גריד קטגוריות
/assets?cat=<id>                     → רמה 2: רשימת ציוד בקטגוריה
/assets?cat=<id>&asset=<id>          → רמה 3: כרטיס נכס
```

---

## רמה 1 — גריד אייקונים של קטגוריות

- כותרת + כפתורי פעולה (פריט חדש / יבוא / יצוא / נהל קטגוריות).
- חיפוש גלובלי — תוצאה קופצת ישירות לכרטיס הנכס (רמה 3).
- שתי קבוצות נפרדות:
  - **נכסים מוקצים לעובדים** (`is_assignable = true`)
  - **נכסים מוסדיים** (`is_assignable = false`)
- כל קטגוריה כקלף עם:
  - אייקון (מיפוי אוטומטי, ראה למטה)
  - שם
  - מונה פריטים
  - תג אדום/כתום אם יש פריטים פגי-תוקף בקטגוריה

```text
┌─ נכסים מוקצים לעובדים ──────────────────────┐
│  [💻]      [📱]      [🚗]      [🔑]         │
│  לפטופים   טלפונים   רכבים     כרטיסים       │
│  24 פריטים 18 פריטים 6 פריטים  12 פריטים     │
└─────────────────────────────────────────────┘
```

### מיפוי אוטומטי של אייקונים
קובץ חדש `src/lib/categoryIcons.ts` — פונקציה `getCategoryIcon(name: string): LucideIcon` שמחזירה את הקומפוננטה לפי מילון מילות-מפתח. מספר התאמות → ההתאמה הראשונה (לפי סדר המילון) זוכה. אם אין התאמה → `Boxes` (ברירת מחדל).

מילון התחלתי (עברית + אנגלית):
- `ביטוח | insurance` → `Shield`
- `חוזה | contract | הסכם` → `FileText`
- `רכב | car | vehicle` → `Car`
- `לפטופ | מחשב | laptop | computer` → `Laptop`
- `מסך | monitor` → `Monitor`
- `טלפון | נייד | phone | mobile` → `Smartphone`
- `מפתח | key` → `Key`
- `כרטיס | card | אשראי` → `CreditCard`
- `נדל״ן | בניין | משרד | building | office` → `Building2`
- `כלי | wrench | tool` → `Wrench`
- `תוכנה | software | מנוי | subscription | רישיון | license` → `KeySquare`
- `ציוד | equipment` → `Package`
- `אבטחה | security` → `Lock`
- `רשת | network | router` → `Wifi`
- `מדפסת | printer` → `Printer`
- `קבצים | מסמך | document` → `FileText`
- `דלק | gas | fuel` → `Fuel`
- ברירת מחדל → `Boxes`

זה עובד גם לקטגוריות חדשות (כמו "ביטוחים") ללא צורך בעבודה ידנית.

---

## רמה 2 — רשימת ציוד בקטגוריה

- Breadcrumb: `נכסים → <שם קטגוריה>`.
- חיפוש מקומי + סינון סטטוס בלבד.
- כפתור "פריט חדש" עם הקטגוריה ממולאת מראש.
- רשימת כרטיסים נקיים: מזהה, שם, בעלות (או "פריט מוסדי"), badge סטטוס, תפוגה.
- לחיצה → רמה 3.

---

## רמה 3 — כרטיס נכס

Breadcrumb: `נכסים → <קטגוריה> → <שם פריט>`.

### א. נכס מוקצה (`is_assignable = true`) — שני טורים
- **ימין — פרטי הנכס**: כל השדות + `custom_fields` + מסמכים מצורפים (`AssetDocumentsSection`).
- **שמאל — בעלים והיסטוריה**:
  - בעלים נוכחי (כרטיס בולט עם פרטי קשר).
  - היסטוריית עובדים שהפריט היה אצלם (מתוך `activity_log` עם `entity_type='asset'` + `entity_id=<asset_id>`, פעולות assign/unassign/transfer, מיון יורד).
  - כפתורי פעולה: שיוך / החזרה / העברה.

### ב. נכס מוסדי (`is_assignable = false`)
- רק כרטיס פרטי הנכס + מסמכים. ללא טור עובדים.

עריכה: כפתור "ערוך" פותח את `EditAssetDialog` הקיים.

---

## פרטים טכניים

### קבצים חדשים
- `src/lib/categoryIcons.ts` — מיפוי שם→אייקון Lucide.
- `src/components/assets/CategoriesGrid.tsx` — רמה 1.
- `src/components/assets/CategoryAssetsList.tsx` — רמה 2.
- `src/components/assets/AssetDetailView.tsx` — רמה 3.

### קבצים שישתנו
- `src/pages/Assets.tsx` — refactor: הופך ל"router" שמחליט איזו רמה להציג לפי `searchParams`. כל הלוגיקה של `groupBy`/`sortKey`/`collapsed`/הטבלה — נמחקת.

### קבצים שיישארו ללא שינוי
- `AddAssetDialog`, `EditAssetDialog`, `AssignAssetWithFormDialog`, `ImportAssetsExcelDialog`, `AssetDocumentsSection`, `CategoryManager`.

### היסטוריית בעלים — שאילתה
שליפה מ-`activity_log` עם `entity_type='asset' AND entity_id=<asset_id>`, פילטור ל-actions שמכילים `assign`/`transfer`/`unassign`, חיבור ל-`employees` להצגת שם. אם אין רשומות — fallback לבעלים נוכחי בלבד.

### עיצוב
- design tokens בלבד (`bg-card`, `border-border`, `text-muted-foreground`).
- Responsive grid: 2 עמודות במובייל, 4 בטאבלט, 5–6 בדסקטופ.
- `animate-fade-in` על מעברי רמות.
