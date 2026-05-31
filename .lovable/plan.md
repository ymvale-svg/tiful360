# מניעת "רענון" המסך בלחיצה על פריט בסיידבר

## הבעיה
דפים כמו `/assets`, `/it-tickets`, `/payroll`, `/settings` נטענים עם `React.lazy()` ב-`src/App.tsx`. כש-`AppLayout` עוטף את ה-`Outlet` ב-`<Suspense fallback={null}>`, בכל מעבר בין דפים lazy אזור התוכן נעלם לרגע ואז מוצג מחדש — נראה כמו רענון מלא.

## הפתרון
שימוש ב-`React.useTransition` + `useNavigate` כדי להשאיר את ה-UI הקיים על המסך עד שהצ'אנק החדש מוכן, במקום להציג fallback ריק.

### שינויים

1. **`src/components/AppSidebar.tsx`**
   - להחליף את `<Link to=...>` בכפתור שמשתמש ב-`useNavigate` בתוך `startTransition` מ-`useTransition`.
   - בזמן `isPending` להוסיף קלאס עדין (למשל `opacity-70` או cursor) על הפריט הנלחץ — בלי להסתיר את התוכן.

2. **`src/components/AppLayout.tsx`**
   - להשאיר את ה-Suspense הפנימי, אך לשנות את ה-fallback כך שלא ימחק את התוכן: אם הצ'אנק לא נטען עדיין ממופע קודם (mount ראשון), להציג שלד עדין במקום `null`. במעברים עוקבים (transition) ה-UI הקיים יישאר בזכות `useTransition`.

3. **(אופציונלי, שיפור נוסף)** Preload של הצ'אנקים הנפוצים על hover על פריט הסיידבר (קריאה ל-`import("@/pages/Assets")` וכו'), כדי שהמעבר ירגיש מיידי.

## פירוט טכני
- `useTransition` מסמן את העדכון כלא-דחוף, ו-React שומר את ה-tree הקודם על המסך עד שה-`lazy` resolve. זה בדיוק התרחיש שמונע את ה"הבזק".
- אין צורך בשינוי ב-`App.tsx` או בהסרת ה-lazy loading (חשוב לביצועים).
- אין שינויים ב-DB, ב-hooks, או בלוגיקה עסקית.

## קבצים שיתעדכנו
- `src/components/AppSidebar.tsx`
- `src/components/AppLayout.tsx`
