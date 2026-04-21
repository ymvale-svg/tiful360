
## יישור RTL אחיד לכל הטבלאות

### הבעיה
במסך עובדים (וטבלאות אחרות) הכותרות (`<th>`) מיושרות עם `text-right` (ימין פיזי), אבל תאי הנתונים (`<td>`) ללא יישור מפורש — מקבלים את ברירת המחדל של הדפדפן שיכולה להיות `start` או להיות מושפעת מתוכן (font-mono, badges, אלמנטים inline-flex). התוצאה: חוסר יישור חזותי בין הכותרת לערכים, במיוחד בעמודות עם תוכן קצר/LTR כמו `EMP-400`.

### הפתרון — כלל CSS גלובלי אחד

#### `src/index.css` — עדכון `.data-table`
החלפה של `text-right` ב-`text-start` (לוגי, נכון ל-RTL ול-LTR), והוספה של אותו כלל ל-`td`:

```css
.data-table th {
  @apply text-start font-medium text-muted-foreground bg-muted/50 px-4 py-3 border-b;
}

.data-table td {
  @apply text-start px-4 py-3 border-b border-border/50;
}
```

זה מבטיח שכל טבלה שמשתמשת ב-class `data-table` (Employees, Assets, EmployeeDetail, EmployeePayslipsTab, Payroll × 3) תהיה מיושרת אחיד מימין.

### ניקוי `text-right` מיותר בטבלאות `data-table`
ב-`src/pages/Payroll.tsx` יש כמה תאים עם `className="font-mono"` בלבד — אלה כבר ירשו את היישור החדש. אין צורך לגעת.

### תיקונים נקודתיים בטבלאות שלא משתמשות ב-`data-table`

טבלאות שמשתמשות ב-`text-right` עם רכיבי `Table`/`TableHead` של shadcn או טבלאות מותאמות — לעבור ל-`text-start` לעקביות:

| קובץ | מיקום |
|---|---|
| `src/pages/Companies.tsx` | `<TableHead className="text-right">` × 4 → `text-start` |
| `src/components/OffboardingFormsManager.tsx` | `<th className="p-2 text-right">` × 5 → `text-start` |
| `src/components/ImportAssetsExcelDialog.tsx` | `<th className="p-2 text-right">` × 5 + tds → `text-start` |
| `src/components/HandoverFormsList.tsx` | אם יש `text-right` בטבלאות — להחליף |
| `src/components/ImportExcelDialog.tsx` | אותו טיפול אם רלוונטי |
| `src/components/OffboardingFormView.tsx` / `HandoverFormView.tsx` | טפסי PDF — להישאר עם `text-right` (נדרש ל-print/PDF, לא תלוי `dir`) |

### בדיקה רוחבית (grep)
לאחר השינוי — `grep` ל-`text-right` בכל `src/`:
- בטבלאות UI אינטראקטיביות → להחליף ל-`text-start`.
- בטפסי PDF/Print (`OffboardingFormView`, `HandoverFormView`, `generate*Pdf.ts`) → להשאיר.
- ב-form labels / input alignment → להשאיר אם מיועד לכוון ספציפי.

### קבצים מושפעים

| קובץ | שינוי |
|---|---|
| `src/index.css` | `.data-table th/td` → `text-start` |
| `src/pages/Companies.tsx` | `TableHead text-right` → `text-start` |
| `src/components/OffboardingFormsManager.tsx` | `th text-right` → `text-start` |
| `src/components/ImportAssetsExcelDialog.tsx` | `th text-right` → `text-start` |
| `src/components/ImportExcelDialog.tsx` | בדיקה + החלפה אם רלוונטי |
| `src/components/HandoverFormsList.tsx` | בדיקה + החלפה אם רלוונטי |

### הערות
- אין שינוי DB / hooks / לוגיקה — שינוי ויזואלי בלבד.
- `text-start` הוא CSS logical property — בדפדפנים מודרניים נתמך מלא (Chrome/Edge/Safari/Firefox).
- טפסי PDF/Print נשארים עם `text-right` כי הם לא תלויים ב-`dir` של ה-document.
- לאחר ביצוע — בדיקה ידנית: עובדים, נכסים, תלושים, חברות, טופסי החזרה — כל הכותרות והתאים מיושרים לקצה ימין באופן זהה.
