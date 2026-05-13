# נגישות ותאימות - פורטל העובד

## מטרה
להביא את פורטל העובד לעמידה בתקן WCAG 2.1 ברמה AA, לוודא תאימות ל-Chrome/Firefox/Edge (2 גרסאות אחרונות), ולשפר רספונסיביות לטאבלט (768-1024px).

## היקף
מסכים ורכיבים בפורטל העובד בלבד:
- `src/pages/EmployeePortal.tsx` (המסך הראשי - 821 שורות, 6+ טאבים)
- `src/pages/Login.tsx`, `src/pages/ResetPassword.tsx`, `src/pages/Welcome.tsx`
- `src/pages/SignHandover.tsx`, `src/pages/SignOffboarding.tsx`, `src/pages/Tax101TokenPage.tsx`
- `src/components/portal/*` (Tax101Banner, MyTax101FormsList)
- דיאלוגים שהעובד פוגש: `NewLeaveRequestDialog`, `NewITTicketDialog`, `Tax101Dialog`, `SignaturePad`, `UploadSignedFormDialog`
- `AppLayout` ו-`AppSidebar` במצב עובד

## שלב 1 - ביקורת נגישות (Audit)
מיפוי הליקויים בפועל וכתיבת דוח קצר ב-`docs/accessibility-audit.md`:
- בדיקת ניגודיות צבעים מול הטוקנים ב-`index.css` (primary, muted-foreground, status badges)
- מיפוי כפתורי icon-only ללא תווית נגישה
- מיפוי שדות טופס ללא `<label htmlFor>` או `aria-label`
- מיפוי תמונות/אייקונים דקורטיביים מול אינפורמטיביים
- בדיקת ניווט מקלדת בכל הטאבים והדיאלוגים
- בדיקת focus-visible על כל הרכיבים האינטראקטיביים
- בדיקת מבנה כותרות (h1/h2/h3) ו-landmarks
- בדיקת הכרזות לקוראי מסך עבור toasts ופעולות אסינכרוניות

## שלב 2 - תיקוני WCAG AA

### 2.1 מבנה סמנטי ו-landmarks
- ודא `<main>`, `<nav>`, `<header>` בכל מסך
- כותרת `h1` יחידה לכל מסך (כרגע יש מסכים ללא h1 ברור)
- היררכיית כותרות נכונה ב-EmployeePortal לפי טאבים
- `lang="he"` ו-`dir="rtl"` כבר קיימים ב-index.html ✓
- skip link "דלג לתוכן הראשי" ב-AppLayout

### 2.2 תוויות וטפסים
- `<Label htmlFor>` לכל שדה קלט (Input, Textarea, Select, DatePicker)
- `aria-required`, `aria-invalid`, `aria-describedby` להודעות שגיאה
- קישור הודעות שגיאה לשדות באמצעות `id`
- `aria-label` לכל כפתורי icon-only (סגירה, עריכה, מחיקה, הורדה, חתימה)
- fieldset/legend לקבוצות רדיו (סוג חופשה, דחיפות תקלה)

### 2.3 תמונות ואייקונים
- `alt=""` לאייקונים דקורטיביים מ-lucide-react
- `aria-hidden="true"` על אייקונים בתוך כפתורים עם טקסט
- `alt` תיאורי לתמונות פרופיל ולוגו
- חתימה דיגיטלית: תיאור נגיש לקנבס + חלופה טקסטואלית

### 2.4 ניווט מקלדת ו-focus
- ודא `focus-visible` ring על כל interactive element (כבר ב-Button ✓, להרחיב ל-card clickable)
- focus trap בדיאלוגים (Radix מספק ✓ - לאמת)
- החזרת פוקוס לאלמנט הפותח בסגירת דיאלוג
- סדר tab הגיוני (במיוחד ב-RTL)
- אין tabIndex חיובי
- ESC סוגר דיאלוגים ו-popovers

### 2.5 ניגודיות וצבעים
- בדיקת כל הטוקנים ב-`index.css` מול 4.5:1 (טקסט) ו-3:1 (UI):
  - `muted-foreground` על `background` - לאמת
  - status badges (status-active, status-leaving וכו') - לאמת
  - sidebar muted על sidebar background
- אין העברת מידע באמצעות צבע בלבד (להוסיף אייקון/טקסט לסטטוסים)

### 2.6 הכרזות דינמיות
- `aria-live="polite"` ל-toaster (sonner) - לאמת קונפיגורציה
- `role="status"` למצבי loading
- `aria-busy` בזמן שליחת טפסים
- הכרזה על ניווט בין טאבים

### 2.7 Touch targets
- מינימום 44x44px לכל יעד מגע (כפתורי icon בטבלאות לרוב 32px - להגדיל)

## שלב 3 - תאימות דפדפנים
- הוספת `browserslist` ל-`package.json`: `last 2 Chrome versions, last 2 Firefox versions, last 2 Edge versions`
- אימות שאין שימוש ב-API לא נתמך (`:has()` נתמך ב-2 גרסאות אחרונות ✓)
- בדיקת polyfills חסרים (Vite מטפל ב-targets אוטומטית)
- בדיקה ידנית ב-Firefox של: חתימה דיגיטלית (canvas), העלאת קבצים, הורדת PDF, תאריכים
- בדיקת date inputs ו-Intl.DateTimeFormat ב-he-IL
- הוספת `<meta name="color-scheme" content="light dark">` ל-index.html

## שלב 4 - רספונסיביות לטאבלט (768-1024px)
מיקוד בטאבלט לעיון בדיונים/טפסים:
- EmployeePortal: רשת טאבים - לוודא שאינם נחתכים, גלילה אופקית במידת הצורך
- טבלאות (תלושים, ימי חופשה, טפסי 101): מעבר לכרטיסים ב-`md:` או הוספת overflow-x נקי
- דיאלוגים: `max-w` מתאים, גלילה פנימית ב-`max-h-[90vh] overflow-y-auto`
- SignaturePad: רוחב הקנבס דינמי + תמיכה ב-touch events (כבר ✓ - לאמת)
- AppSidebar: התנהגות במצב טאבלט (collapse אוטומטי?)
- breakpoint audit: שימוש עקבי ב-`md:` (768) ו-`lg:` (1024)

## שלב 5 - אימות
- הרצת `eslint-plugin-jsx-a11y` (להוסיף לקונפיג) ולתקן warnings
- בדיקה ידנית עם NVDA/VoiceOver (תיעוד תוצאות)
- בדיקה עם Lighthouse Accessibility - יעד ציון ≥95
- בדיקת keyboard-only ניווט בכל זרימה: התחברות → צפייה בתלוש → בקשת חופשה → חתימה על טופס
- בדיקה ויזואלית ב-3 רוחבים: 1280, 1024, 768

## פרטים טכניים
- הוספת dependency: `eslint-plugin-jsx-a11y`
- יצירת `src/components/SkipLink.tsx`
- יצירת `docs/accessibility-audit.md` עם ממצאים ולוג תיקונים
- אין שינויים ב-DB, באוטנטיקציה, או בלוגיקה עסקית - רק UI/markup/styles
- שינויים יבוצעו בפעימות לפי קבצים כדי לאפשר QA הדרגתי

## מחוץ להיקף
- מסכי האדמין (Dashboard, Employees, Assets, Settings וכו')
- WCAG AAA
- תמיכה ב-Safari/Mobile Safari
- בדיקות אוטומטיות (axe-core ב-CI) - ניתן בעתיד
