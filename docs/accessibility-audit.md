# דו"ח נגישות - פורטל העובד

יעד: עמידה בתקן **WCAG 2.1 ברמה AA** עבור פורטל העובד, תאימות ל-Chrome / Firefox / Edge (2 גרסאות אחרונות), ורספונסיביות לטאבלט (768-1024px).

---

## תיקונים שבוצעו (Iteration 1)

### תשתית כללית
- **`src/components/SkipLink.tsx`** — נוסף רכיב Skip Link ("דלג לתוכן הראשי"). מוצג כאשר הוא ב-focus (Tab ראשון). WCAG 2.4.1.
- **`src/components/AppLayout.tsx`** — `<main id="main-content" tabIndex={-1}>`, `role="banner"` ל-header, `aria-label` לכל כפתורי icon-only (התראות, יציאה, מעבר לפורטל), `aria-hidden` על אייקונים דקורטיביים, `<label htmlFor>` לחיפוש כללי, `focus-visible:ring`, `role="status"` למצב טעינה.
- **`index.html`** — נוספו `<meta name="color-scheme" content="light dark">` ו-`theme-color`. `lang="he"` ו-`dir="rtl"` כבר היו קיימים ✓
- **`package.json`** — נוסף `browserslist`: 2 גרסאות אחרונות של Chrome/Firefox/Edge.

### דפי כניסה
- **`src/pages/Login.tsx`** — `<main>`, `<section aria-labelledby>`, `alt` תיאורי ללוגו, `aria-hidden` ל-SVG דקורטיבי, `aria-busy` ב-Google button.
- **`src/pages/Welcome.tsx`** — `<main>`, `<label htmlFor>` לכל שדה סיסמה, `autoComplete="new-password"`, `aria-required`, `aria-pressed` למתג הצג/הסתר סיסמה, `aria-label` הולם, `role="separator"` לקו "או".
- **`src/pages/ResetPassword.tsx`** — אותם תיקונים כמו Welcome.

### פורטל העובד
- **`src/pages/EmployeePortal.tsx`**
  - `<h1>` סמנטי עם הברכה לעובד.
  - Tabs ממומשים כ-ARIA pattern: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`, `tabIndex` נכון, ו-`role="tabpanel"` עם `aria-labelledby` בכל פאנל.
  - כל כפתורי icon-only (יציאה, מעבר תפעול, התקשר ל…) קיבלו `aria-label` תיאורי.
  - אייקונים מ-lucide-react סומנו כ-`aria-hidden`.
  - `<main id="main-content">` מאפשר ל-Skip Link לעבוד.
  - `focus-visible:ring` על כל יעד אינטראקטיבי.
  - **תאימות טאבלט**: tabs עוברות ל-`md:grid-cols-6`, `max-w-3xl` ב-md+, דיאלוגים עם `max-h-[90vh] overflow-y-auto`.

### חתימה דיגיטלית
- **`src/components/SignaturePad.tsx`** — מסגרת הקנבס סומנה כ-`role="img"` עם `aria-labelledby` ו-`aria-describedby` (הוראות סמויות לקורא מסך). הקנבס עצמו עם `aria-label`. כפתור הניקוי עם `aria-label` מותאם.

### דיאלוגים
- **`src/components/NewLeaveRequestDialog.tsx`** — `<fieldset>` + `<legend>` לסוג בקשה, `role="radiogroup"` + `role="radio"` עם `aria-checked`, `htmlFor` לכל שדה, `aria-required`, `aria-live="polite"` לחישוב הימים, `aria-busy` בשליחה.
- **`src/components/NewITTicketDialog.tsx`** — `htmlFor` לכל Label, `aria-required` בשדות חובה, `aria-describedby` ל-hint של טלפון ול-counter של תיאור, `aria-label` לכפתור "הסר" של קבצים, `aria-busy` בשליחה, `inputMode="tel"` ו-`autoComplete="tel"` לטלפון.
- **`src/components/UploadSignedFormDialog.tsx`** — `htmlFor` לכל שדה, `sr-only` לקלט קובץ במקום `hidden`.

### דפי חתימה ציבוריים
- **`src/pages/SignHandover.tsx`**, **`src/pages/SignOffboarding.tsx`** — `<main>` סמנטי, `role="status"` ו-`aria-live` למצב טעינה, `role="alert"` לקישור פגום, `title` תיאורי ל-iframe, `htmlFor` ל-attachment input.
- **`src/pages/Tax101TokenPage.tsx`** — `<main>`, `<h1>`, `alt` תיאורי ללוגו החברה, `role="alert"` לשגיאות, `aria-hidden` לאייקונים דקורטיביים.

---

## נושאים שעדיין דורשים תשומת לב

### בעדיפות גבוהה
1. **`src/components/Tax101Dialog.tsx`** — מסך מורכב עם 6 שלבים, מאות שדות. נדרש מעבר מקיף להוסיף `htmlFor` לכל Label, `aria-required` בשדות חובה, ו-`aria-invalid` + `aria-describedby` לקישור הודעות שגיאה. השלמה מומלצת בפעימה נפרדת.
2. **בדיקת ניגודיות צבעים** — להריץ Lighthouse Accessibility על כל מסכי הפורטל. במיוחד:
   - `text-muted-foreground` על `bg-background` (`hsl(215 15% 47%)` על `hsl(210 20% 98%)` → ~4.6:1 ✓)
   - אייקוני סטטוס בצבעי amber/emerald/rose - לוודא בכל ה-themes.
3. **eslint-plugin-jsx-a11y** — להוסיף ל-eslint config ולתקן warnings אוטומטיים.

### בעדיפות בינונית
4. **`src/components/SignaturePad`** — `react-signature-canvas` לא תומך בניווט מקלדת. במידת הצורך להוסיף חלופה (העלאת תמונת חתימה).
5. **`src/components/ui/sonner.tsx`** — לוודא ש-sonner כולל `role="status"` / `aria-live="polite"` בהתראות (ברירת המחדל של sonner ✓).
6. **Dialogs** — Radix מספק focus trap והחזרת פוקוס ל-trigger ✓ (לא דורש פעולה).
7. **Touch targets** — חלק מכפתורי ה-icon בפורטל הם 32x32px. להגדיל ל-44x44 בפעימה הבאה (WCAG 2.5.5 - AAA, מומלץ גם ב-AA).

### תאימות דפדפנים — נוספה הצהרה
- `browserslist` ב-`package.json` מנחה את Vite/PostCSS/autoprefixer לייצר קוד תואם.
- ה-app משתמש ב-API סטנדרטיים בלבד (Fetch, Intl, ResizeObserver, getBoundingClientRect, geolocation) — נתמכים מלא ב-2 הגרסאות האחרונות של 3 הדפדפנים.
- מומלץ לבצע smoke test ידני ב-Firefox: חתימה דיגיטלית, העלאת קבצים, הורדת PDF, date inputs.

### רספונסיביות לטאבלט (768-1024px)
- ה-tab grid עבר מ-`grid-cols-3` (קבוע) ל-`grid-cols-3 md:grid-cols-6` — שורה אחת בטאבלט במקום שתיים.
- `max-w-2xl md:max-w-3xl` נותן יותר רוחב בטאבלט.
- Dialogs כבר משתמשים ב-`max-h-[90vh] overflow-y-auto` — מתאים.
- SignaturePad כבר רספונסיבי דרך `ResizeObserver` ✓.

---

## אימות

### צעדי בדיקה ידניים מומלצים
1. **Skip Link**: טען `/portal`, לחץ Tab — צריך להופיע "דלג לתוכן הראשי" בפינה ימנית עליונה.
2. **ניווט מקלדת**: עבור מקצה לקצה ב-`/portal`, `/login`, `/welcome` עם Tab/Shift+Tab בלבד. ודא שכל יעד אינטראקטיבי מקבל focus ring נראה.
3. **טאבים**: בפורטל, חיצים ימינה/שמאלה אינם מטופלים עדיין (נדרש keyboard handler עתידי) — לחיצה Tab עוברת בין הטאב הפעיל לתוכן.
4. **קוראי מסך**: VoiceOver (macOS) או NVDA (Windows) — אמת את: קריאת ה-h1, הודעות שגיאה, מצבי loading.
5. **Lighthouse**: יעד ציון Accessibility ≥ 95 בפורטל ובדף הכניסה.
6. **רספונסיביות**: בדוק ב-1280, 1024, 768 - אין גלילה אופקית, טאבים נראים.

### Browserslist Coverage
תוצאת `npx browserslist`:
- Chrome (last 2)
- Firefox (last 2)
- Edge (last 2)

פוקוס תאימות מצומצם בכוונה — מאפשר שימוש ב-features מודרניים (CSS Grid, Flexbox gap, `:has()`, ES2022) ללא polyfills.
