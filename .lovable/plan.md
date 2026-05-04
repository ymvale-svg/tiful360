## מטרה
משתמש שיש לו גם תפקיד `employee` וגם תפקיד נוסף שמאפשר צפיה/עריכה בתפעול (admin / it_manager / operations / direct_manager / payroll / super_admin) – יראה אחרי הכניסה מסך בחירה בין שתי האפשרויות:
- **תפעול 360** – הממשק הניהולי (Dashboard / לפי התפקיד)
- **פורטל עובדים** – פורטל העובד האישי

משתמש עם תפקיד אחד בלבד (רק עובד או רק תפעולי) – ייכנס ישירות כמו היום, ללא מסך בחירה.

## זרימה מתוכננת

```text
Login → SelectCompany (אם יש כמה חברות) 
      → SelectExperience (חדש, רק אם dual-role)
            ├── תפעול 360  → / (או דיפולט לפי תפקיד)
            └── פורטל עובדים → /portal
```

## פרטים טכניים

### 1. דף חדש: `src/pages/SelectExperience.tsx`
- מסך בסגנון `SelectCompany` עם שני כרטיסים גדולים: "תפעול 360" ו"פורטל עובדים".
- בחירה שומרת את ההעדפה ב-`sessionStorage` (`activeExperience: 'ops' | 'portal'`) ומנווטת ליעד המתאים.
- נוסיף כפתור "החלף תצוגה" קטן ב-`AppLayout` ובכותרת ה-Portal כדי שיוכל לעבור בין השניים בלי logout.

### 2. ראוט חדש ב-`src/App.tsx`
```tsx
<Route path="/select-experience" element={<ProtectedRoute><SelectExperience /></ProtectedRoute>} />
```

### 3. עדכון `src/pages/SelectCompany.tsx`
פונקציה חדשה `hasDualAccess(roles)` – `true` אם המשתמש כולל `employee` וגם לפחות אחד מ: `admin / super_admin / it_manager / operations / direct_manager / payroll`.

ב-handlers (גם auto-redirect של חברה אחת וגם `handleSelect`):
```ts
if (hasDualAccess(roles)) navigate("/select-experience");
else navigate(defaultRoute);
```

### 4. עדכון `src/pages/Dashboard.tsx`
ה-redirect הקיים שמחזיר עובד-בלבד ל-`/portal` נשאר. אין שינוי נוסף – המשתמש הדואלי שבחר "תפעול 360" יישאר ב-Dashboard.

### 5. כפתור החלפת תצוגה
- ב-`AppLayout` (header) – אם `hasDualAccess` → כפתור "מעבר לפורטל עובדים" שמוביל ל-`/portal`.
- ב-`EmployeePortal` (header) – אם `hasDualAccess` → כפתור "מעבר לתפעול 360" שמוביל ל-`/`.

## קבצים שיושפעו
- **חדש**: `src/pages/SelectExperience.tsx`
- **עריכה**: `src/App.tsx`, `src/pages/SelectCompany.tsx`, `src/components/AppLayout.tsx`, `src/pages/EmployeePortal.tsx`

## מה לא נוגעים בו
- לוגיקת ההרשאות וה-RLS – ללא שינוי.
- Login ו-ProtectedRoute – ללא שינוי.
- משתמשים עם תפקיד יחיד – חוויה זהה לחלוטין להיום.
