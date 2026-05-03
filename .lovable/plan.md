
# תוכנית — 3 שיפורים ליומן הנוכחות

## 1) כלל אוטומטי: מיון כניסה/יציאה

**הבעיה:** השעון U560 שולח רוב הרשומות עם `state=0` → `direction="unknown"`. כיום אין מי שמסווג אותן ככניסה/יציאה.

**הפתרון:** פונקציית DB + טריגר שיריצו את הכלל הבא בכל הוספת `attendance_punches`:

- כשה־`direction='unknown'`, קבע לפי **סדר הפעימות של אותו עובד באותו יום**:
  - מס׳ אי־זוגי (1, 3, 5…) → `in`
  - מס׳ זוגי (2, 4, 6…) → `out`
- כשה־agent כבר שלח `in`/`out` מפורש (state 4/5/1) — לא ננגע.
- פונקציית backfill חד־פעמית שתסווג את כל הפעימות הקיימות.
- הוספת ערכים חוקיים `'in' | 'out' | 'unknown'` (כבר קיים).

**איפה זה רץ:**
- migration: `public.classify_punch_direction()` + טריגר `BEFORE INSERT OR UPDATE ON attendance_punches`.
- כפתור "סווג מחדש" בטאב "שעון נוכחות" (Payroll) להפעלת ה־backfill ידנית.

## 2) סנכרון יומן נוכחות עם פורטל העובדים

**הבעיה:** הפורטל קורא היום מטבלה ישנה `attendance_records`, אבל הסוכן שולח ל־`attendance_punches`. העובד לא רואה כלום.

**הפתרון:**
- ב־`EmployeePortal.tsx` (טאב "נוכחות"): להחליף את ה־query ל־`attendance_punches` של העובד הנוכחי.
- להציג **תצוגה יומית מקובצת**: לכל יום בחודש האחרון — כניסה ראשונה, יציאה אחרונה, סך שעות, ומקור (שעון/פורטל).
- מקור הזמן יהיה `direction` המסווג (אחרי הטריגר משלב 1).
- ה־RLS הקיים `Employees view own punches` כבר מאפשר את הקריאה — אין שינוי הרשאות.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE attendance_punches` כדי שהיומן בפורטל יתעדכן רגע שהשעון משדר.

## 3) חתימה מרחוק לעובדי שטח

**הבעיה:** עובדי שטח לא מגיעים לשעון הפיזי, ואין דרך לדווח כניסה/יציאה מהפורטל.

**הפתרון:**

### א. הרשאה ייעודית לעובד
- שדה חדש בטבלת `employees`: `can_remote_punch boolean default false`.
- ב־UI של עריכת עובד (`EditEmployeeDialog`) — מתג "מורשה דיווח נוכחות מרחוק".

### ב. כפתור "דיווח נוכחות" בפורטל
- בטאב "נוכחות", רק אם `myEmployee.can_remote_punch === true`:
  - שני כפתורים: **"כניסה"** / **"יציאה"**.
  - בלחיצה — דיאלוג עם:
    - תצוגת זמן נוכחי (לקוח — נשמר server-side `now()`)
    - רכיב חתימה (משתמשים ב־`SignaturePad` הקיים)
    - שדה הערה אופציונלי
    - לכידת geolocation (אופציונלית, אם המשתמש מאשר)
  - שליחה כותבת ל־`attendance_punches`:
    - `source = 'portal_remote'`
    - `direction = 'in'/'out'` (מפורש — לא יעבור דרך הכלל האוטומטי)
    - `status = 'pending'`
    - `raw_payload = { signature_data_url, geo, note, user_agent }`

### ג. הצגה ב־UI הניהולי
- בטאב "שעון נוכחות" (Payroll): badge קטן "מרחוק 🖊️" לפעימות עם `source='portal_remote'`, ולחיצה פותחת תצוגת החתימה והמיקום.

### ד. סנכרון אוטומטי ליומן
- אותה פעימה נכנסת ל־`attendance_punches` ולכן מוצגת מיד גם בטאב "נוכחות" של אותו עובד בפורטל וגם בטאב הניהול (משלב 2).

## פרטים טכניים

```text
attendance_punches  ──insert──▶  trigger classify_punch_direction()
                                         │
                                         ▼
                                  direction נקבע
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
   טאב Payroll (קיים)        טאב פורטל "נוכחות" (חדש)     Realtime push לפורטל
```

**Migrations שיווצרו:**
1. `add_can_remote_punch_to_employees`
2. `attendance_punch_direction_trigger` — פונקציה + טריגר + backfill ידני (פונקציה נפרדת `classify_existing_punches(company_id)`)
3. `enable_realtime_for_attendance_punches`

**קבצי קוד שיתעדכנו:**
- `src/pages/EmployeePortal.tsx` — החלפת query + רכיב דיווח מרחוק
- `src/components/EditEmployeeDialog.tsx` + `AddEmployeeDialog.tsx` — מתג הרשאה
- `src/components/payroll/AttendanceClockTab.tsx` — badge + תצוגת חתימה
- רכיב חדש: `src/components/portal/RemotePunchDialog.tsx`
- `src/hooks/useAttendancePunches.ts` — הוק חדש `useMyPunches` + `useCreateRemotePunch`

**ללא שינוי:** הסוכן המקומי (agent), edge function `ingest-attendance-punch`, מבנה הטוקן.

## מה לא נכלל (לאשר אם רוצים)
- שמירת תמונת חתימה כקובץ ב־storage bucket ייעודי (כרגע נשמרת base64 ב־`raw_payload`).
- אכיפת geofence (חסימה אם רחוק מהאתר).
- שליחת מייל למנהל בכל פעימה מרחוק.

לאשר ואתחיל?
