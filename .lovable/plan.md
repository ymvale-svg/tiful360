

## בדיקת RTL מקיפה — רשימות נפתחות, דיאלוגים, ותפריטים

### ממצאי הבדיקה המעמיקה

מעבר על כל קומפוננטי ה-shadcn ועל הדיאלוגים בפרויקט חשף הטיות LTR נוספות מעבר למה שזוהה קודם:

#### 1. תפריטים נפתחים (Dropdown / Select / Context / Menubar)
- **`dropdown-menu.tsx`** — `DropdownMenuShortcut` עם `ml-auto` (דוחק שמאלה — ב-RTL צריך `mr-auto` או `ms-auto`). `SubTrigger` עם `ChevronRight` ו-`ml-auto` — החץ אמור להצביע שמאלה ב-RTL (`ChevronLeft`) ולהיות בצד שמאל.
- **`select.tsx`** — `SelectContent` בעל `data-[side]:slide-in` נכון, אבל ה-scroll buttons וה-`SelectItem` עם `pl-8 pr-2` (padding למקום ה-✓) הפוכים ל-RTL. אייקון ה-✓ ממוקם `left-2` — צריך `right-2` ב-RTL. `SelectTrigger` עם `ChevronDown` בסדר.
- **`context-menu.tsx`** — אותן בעיות בדיוק כמו `dropdown-menu`: `ml-auto`, `ChevronRight` ב-SubTrigger, `left-2` ל-✓ ב-CheckboxItem/RadioItem.
- **`menubar.tsx`** — אותן בעיות (`ml-auto`, `ChevronRight`, `left-2`).
- **`navigation-menu.tsx`** — חץ ה-`ChevronDown` של ה-trigger בסדר; ללא בעיות RTL מהותיות.
- **`command.tsx`** (CommandPalette / SearchableSelect) — `CommandShortcut` עם `ml-auto`; אייקונים עם `mr-2` קבוע.

#### 2. דיאלוגים ו-Sheets (חוזר על מה שזוהה + הרחבה)
- **`dialog.tsx` / `alert-dialog.tsx` / `sheet.tsx`** — X בצד ימין, Header `sm:text-left`, Footer `space-x-2` (כפי שכבר זוהה).
- **`drawer.tsx`** — Header `text-center sm:text-left`, Footer `space-x-2` — אותה בעיה.

#### 3. רכיבים נוספים שלא נבדקו קודם
- **`toast.tsx` / `sonner.tsx`** — כפתור הסגירה של ה-Toast ממוקם `right-2 top-2`; ב-RTL צריך לעבור שמאלה. `ToastViewport` מוגדר `sm:right-0` — עדיף `sm:end-0` (או `rtl:left-0 rtl:right-auto`) כדי שטוסטים יקפצו מהפינה הנכונה.
- **`alert.tsx`** — אייקון ב-`absolute left-4 top-4` עם `pl-7` על הטקסט — הפוך ב-RTL (האייקון צריך להיות בצד ימין והטקסט עם `pr-7`).
- **`checkbox.tsx`** / **`radio-group.tsx`** — אין בעיה.
- **`switch.tsx`** — האנימציה של ה-thumb (`data-[state=checked]:translate-x-5`) חד-כיוונית; ב-RTL הוא ינוע לכיוון הלא-טבעי. צריך `rtl:data-[state=checked]:-translate-x-5`.
- **`pagination.tsx`** — `PaginationPrevious`/`Next` משתמשים ב-`ChevronLeft`/`ChevronRight` קבועים — צריכים להתחלף ב-RTL.
- **`breadcrumb.tsx`** — מפריד `ChevronRight` קבוע — ב-RTL זה צריך להיות `ChevronLeft` (שובל קורא ימין-לשמאל).
- **`carousel.tsx`** — כפתורי הניווט הקודם/הבא ממוקמים `-left-12` / `-right-12` ומשתמשים בחיצים קבועים — צריכים להתחלף ב-RTL.
- **`accordion.tsx`** — `ChevronDown` במרכז סוף הטריגר; בסדר.
- **`calendar.tsx`** — חיצי ניווט חודש קודם/הבא קבועים (`ChevronLeft`/`ChevronRight`) — צריכים להתחלף ב-RTL.
- **`sidebar.tsx`** — `defaultSide="right"` ב-RTL פועל הפוך מהמצופה. ה-rail וה-trigger לפתיחה/סגירה ממוקמים בצד שגוי. דורש לוגיקת `dir`-aware.
- **`scroll-area.tsx`** — ה-scrollbar האנכי ממוקם default על ימין; ב-RTL נכון יהיה שמאל (`rtl:right-auto rtl:left-0` למסילה).

#### 4. דיאלוגים אפליקטיביים ללא `dir="rtl"`
מעבר ל-`AttendanceCorrectionDialog` ו-`PayslipSummaryDialog` שכבר זוהו, יש לוודא שכל ה-Dialogs בפרויקט מקבלים `dir="rtl"` (Radix מרנדר ב-Portal — לא תמיד יורש מה-`<html>` בצורה מהימנה ב-CSS שמשתמש ב-`left/right`).

### השינויים המוצעים

| קובץ | תיקון |
|---|---|
| `src/components/ui/dialog.tsx` | X: `rtl:right-auto rtl:left-4`. Header: `sm:text-right`. Footer: `space-x-2` → `gap-2`. |
| `src/components/ui/alert-dialog.tsx` | Header: `sm:text-right`. Footer: `gap-2`. |
| `src/components/ui/sheet.tsx` | X: `rtl:right-auto rtl:left-4`. Header: `sm:text-right`. Footer: `gap-2`. |
| `src/components/ui/drawer.tsx` | Header: `sm:text-right`. Footer: `gap-2`. |
| `src/components/ui/dropdown-menu.tsx` | `Shortcut`: `ml-auto` → `ms-auto`. `SubTrigger`: החלפת `ChevronRight` ב-`ChevronLeft` ב-RTL + מיקום שמאלה. CheckboxItem/RadioItem: ✓ מ-`left-2` ל-`rtl:left-auto rtl:right-2`, padding מתחלף. |
| `src/components/ui/context-menu.tsx` | אותם תיקונים כמו dropdown-menu. |
| `src/components/ui/menubar.tsx` | אותם תיקונים כמו dropdown-menu. |
| `src/components/ui/select.tsx` | `SelectItem`: ✓ מ-`left-2` ל-`rtl:left-auto rtl:right-2`, padding `pl-8 pr-2` → `ps-8 pe-2` (logical). |
| `src/components/ui/command.tsx` | `CommandShortcut`: `ml-auto` → `ms-auto`. |
| `src/components/ui/toast.tsx` | `ToastClose`: `right-2` → `rtl:right-auto rtl:left-2`. `ToastViewport`: `sm:right-0` → `sm:end-0` או fallback RTL. |
| `src/components/ui/alert.tsx` | אייקון `left-4` + `pl-7` → גרסה logical: `start-4` + `ps-7`. |
| `src/components/ui/switch.tsx` | תנועת thumb: הוספת `rtl:data-[state=checked]:-translate-x-5`. |
| `src/components/ui/pagination.tsx` | החלפת `ChevronLeft`/`Right` ב-RTL (החלפה הדדית). |
| `src/components/ui/breadcrumb.tsx` | מפריד: `ChevronRight` → ב-RTL `ChevronLeft`. |
| `src/components/ui/carousel.tsx` | כפתורי prev/next: היפוך מיקום וחיצים ב-RTL. |
| `src/components/ui/calendar.tsx` | החלפת חיצי ניווט החודש ב-RTL. |
| `src/components/ui/scroll-area.tsx` | scrollbar אנכי: `rtl:right-auto rtl:left-0`. |
| `src/components/AttendanceCorrectionDialog.tsx` | `dir="rtl"` ל-`DialogContent`. |
| `src/components/PayslipSummaryDialog.tsx` | `dir="rtl"` ל-`DialogContent`. |
| יתר הדיאלוגים האפליקטיביים | לוודא `dir="rtl"` עליהם (Add/Edit Asset, Employee, Leave, Handover, Offboarding, Import Excel, Transfer Asset, Review Leave, Upload Signed Form, וכו'). |

### לא נוגעים
- `font-mono` + `dir="ltr"` על ת"ז/טלפון/מייל/קודי נכסים — נשאר.
- `Sidebar side="right"` הוא הצד הנכון ב-RTL פיזית — נשאר, אבל נוודא שה-rail וה-trigger לא נשברים (אם כן, נעדכן).

### בדיקה לאחר ביצוע
1. פתיחת כל סוג רשימה נפתחת (Select, Dropdown, Context Menu, Combobox/Command) — סימון ✓ בצד ימין, קיצורי מקלדת בצד שמאל, חיצי תת-תפריטים מצביעים שמאלה.
2. כל הדיאלוגים: X בשמאל, כותרת מימין, פוטר עם רווחים נכונים.
3. Toast קופץ מהפינה הנכונה, X שלו בשמאל.
4. Alert: אייקון מימין, טקסט מיושר נכון.
5. Switch: ידית נעה לכיוון הנכון ב-RTL.
6. Pagination / Breadcrumb / Carousel / Calendar: חיצים בכיוון הקריאה.
7. Scrollbar אנכי מופיע בצד שמאל.

