## הבעיה
בקובץ `src/pages/EmployeePortal.tsx` (שורה 215) ההחתמה מרחוק קוראת ל-`navigator.geolocation.getCurrentPosition` עם:
```js
{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
```
זו קריאה **בודדת** עם דרישת דיוק גבוהה ו-timeout קצר. כש-GPS עוד לא "התחמם" (בהפעלה ראשונה, בתוך מבנה, או בדפדפן Safari/Chrome מוביילי) הקריאה נכשלת ב-`TIMEOUT (code 3)` או `POSITION_UNAVAILABLE (code 2)` — גם כשבאפליקציות אחרות (Maps, Waze) GPS עובד, כי הן מחזיקות **stream רציף** של מדידות במקום קריאה חד-פעמית.

## התיקון

ב-`src/pages/EmployeePortal.tsx` בפונקציה `handlePunch`:

1. להחליף את `getCurrentPosition` ב-`watchPosition` שמזרים מדידות ככל שה-GPS מתחזק.
2. לקבל את המדידה הראשונה עם accuracy ≤ 100מ׳ — מסיים מיד.
3. אחרי 8 שניות — לקבל כל מדידה שהגיעה, גם אם דיוק נמוך.
4. אם עדיין אין כלום — לבצע fallback ל-`getCurrentPosition` עם `enableHighAccuracy: false` (משתמש ב-Wi-Fi/סלולר), כמו שמפות עושים.
5. timeout מוחלט 25 שניות במקום 15.
6. הודעות שגיאה ספציפיות לכל קוד שגיאה (1=denied, 2=unavailable, 3=timeout).

תוצאה: ההחתמה תצליח ברוב המוחץ של המקרים שבהם GPS פעיל אך עדיין לא תפס נעילה מדויקת.

## קבצים
- ערוך: `src/pages/EmployeePortal.tsx` (החלפת לוגיקת `handlePunch`).
