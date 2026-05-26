# תיקון "ריפרוש מוזר" בלחיצה על משאב

## הבעיה
ב-`src/App.tsx` יש שני Routes נפרדים לאותו רכיב:
```
/assets/:domain        → AssetsDomainPage
/assets/:domain/:itemId → AssetsDomainPage
```
כשהמשתמש לוחץ על כרטיס משאב, ה-URL משתנה ו-React Router רואה זאת כ-match שונה. התוצאה: unmount + remount של `AssetsDomainPage` (lazy), מה שגורם ל:
- הצגת ה-PageLoader של Suspense ("טוען...")
- איפוס state מקומי (חיפוש, sort, sub וכד׳)
- Re-execution של ה-queries

זה ה"ריפרוש המוזר" שהמשתמש מתאר.

## הפתרון
לאחד לראוט יחיד עם פרמטר אופציונלי, כך ש-React Router שומר על אותו element instance במעבר בין רשימה לפרטים:

```tsx
<Route
  path="/assets/:domain/:itemId?"
  element={<ProtectedRoute ...><AssetsDomainPage /></ProtectedRoute>}
/>
```

(React Router v6 תומך בסיומת `?` עבור פרמטרים אופציונליים.)

הרכיב עצמו כבר תומך בשני המקרים פנימית (קורא `params.itemId` ומחזיר `AssetDetailView` כשקיים), אז אין שינוי לוגי נוסף.

## קבצים שמשתנים
- `src/App.tsx` — איחוד שתי השורות 76-77 לראוט יחיד עם `:itemId?`.

## בדיקה
לחיצה על משאב ב-`/assets/physical` תעבור ל-`/assets/physical/<id>` ותציג את `AssetDetailView` ללא הבהוב, ללא Suspense fallback וללא איפוס state.
