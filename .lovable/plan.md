## הבנת הבקשה

תת-הקטגוריה (כלומר, פריט בודד בתוך קטגוריה — למשל "כרטיס נוכחות EZR-0526-001") תוצג כאייקון גדול וצבעוני בדיוק כמו הקטגוריות ברמה 1. לחיצה על האייקון תפתח את מסך פרטי הפריט הקיים, הכולל את רשימת השיוכים לעובדים והיסטוריית ההקצאות.

## מה נשנה

### 1. רמה 2 — `CategoryAssetsList.tsx` (השינוי המרכזי)

- הסרת ה-toggle בין "אייקונים / רשימה" — תישאר **רק תצוגת אייקונים** אחידה עם רמה 1
- כל פריט יוצג ככרטיס מרובע (`aspect-square`) עם:
  - מיכל אייקון `w-20 h-20` עם רקע צבעוני (`color.bg`) ואייקון `w-10 h-10` בצבע (`color.text`) — יורש מהקטגוריה האב באמצעות `getCategoryIcon` ו-`getCategoryColor`
  - שם הפריט במרכז, בולט
  - מתחתיו: קוד הפריט (`asset_code`) בטקסט קטן ועמום
  - תג סטטוס קטן בפינה: "במלאי" / "מוקצה" / "בתיקון" / "אבד" — בצבע מבדיל
  - אם מוקצה — שם העובד בשורת המשנה במקום "במלאי"
  - אפקט hover זהה לקטגוריות (`hover:ring-2`, `hover:-translate-y-0.5`, `group-hover:scale-105`)
- לחיצה תוביל לרמה 3 הקיימת (`AssetDetailView`) — ללא שינוי בניווט

### 2. רמה 3 — `AssetDetailView.tsx` (חיזוק קל)

- בכותרת הכרטיס: אייקון גדול (`w-16 h-16`) באותו סגנון צבעוני, ליד שם הפריט
- הדגשה ויזואלית של מקטעי "בעלות נוכחית" ו"היסטוריית הקצאות" — כדי שהקשר של "מי משויך לפריט" יהיה ברור מיד

## פירוט טכני

```text
src/components/assets/
  CategoryAssetsList.tsx    ← רק תצוגת גריד אייקונים (ללא toggle/list)
  AssetDetailView.tsx       ← אייקון גדול בכותרת + הדגשת מקטעי שיוך
```

מבנה הכרטיס המוצע:
```tsx
<button className="aspect-square ... hover:ring-2 ...">
  <Badge status={...} />               {/* פינה עליונה */}
  <div className={`w-20 h-20 ${color.bg} rounded-2xl`}>
    <Icon className={`w-10 h-10 ${color.text}`} />
  </div>
  <div className="font-semibold">{asset.name}</div>
  <div className="text-xs text-muted-foreground">{asset.asset_code}</div>
  <div className="text-xs">{ownerName ?? "במלאי"}</div>
</button>
```

ללא שינויים בסכמה, ב-DB, או בניתובים. שימוש חוזר ב-`getCategoryColor`/`getCategoryIcon` הקיימים מ-`src/lib/categoryIcons.ts` כדי לשמור על אחידות עם רמה 1.

## מה לא משתנה

- מבנה 3 הרמות (קטגוריות → פריטים → פרטי פריט)
- רמה 1 (`CategoriesGrid.tsx`) — נשארת כפי שהיא
- מילון האייקונים והצבעים
- כל הדיאלוגים (הוספה / יבוא / עריכה / הקצאה)
