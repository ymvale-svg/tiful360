## עדכון תכנית — להשלים את מה שנותר + דגל "מחתים נוכחות" פר עובד

### חלק חדש 0 — דגל "מחתים נוכחות" פר עובד
- **DB**: `employees.tracks_attendance boolean not null default true` (מיגרציה).
- **`get_attendance_gaps`**: סינון נוסף — `WHERE e.tracks_attendance = true`. עובדים שלא מחתימים (פרילנסרים, בעלים) לא יופיעו בדוח הפערים.
- **UI**: הגדרה מתבצעת **רק בתיק העובד** (`EditEmployeeDialog`) — Switch "עובד מחתים נוכחות". `AddEmployeeDialog` לא משתנה (ברירת מחדל `true` בעת יצירה).
- **`AttendanceCorrectionDialog`**: אם `tracks_attendance=false` — הודעה "עובד זה אינו מחתים נוכחות" וחסימת שליחה.

### חלק 1 — `EditEmployeeDialog` (ימי עבודה)
- צ׳קבוקסים א׳–שבת (`work_days smallint[]`), ברירת מחדל מהעובד או `{0,1,2,3,4}`.

### חלק 2 — `EmployeePortal.tsx`
- בקריאת `?correction=open&date=YYYY-MM-DD` נפתח `AttendanceCorrectionDialog` אוטומטית עם `initialDate` ממולא, ו-tab נוכחות פעיל.

### חלק 3 — `AttendanceCorrections.tsx`
- Badge "הוחל על השכר" כאשר `applied_at IS NOT NULL`.

### חלק 4 — פריסת Edge Functions
- `send-attendance-gaps` (חדש, JWT verify).
- וידוא רישום שאר הפונקציות החדשות ב-`supabase/config.toml`.

### קבצים
**מיגרציה**: הוספת `employees.tracks_attendance` + עדכון `get_attendance_gaps` לסינון לפיו.
**עריכה**: `EditEmployeeDialog.tsx`, `EmployeePortal.tsx`, `AttendanceCorrections.tsx`, `AttendanceCorrectionDialog.tsx`.

### הערה
עובדים עם `tracks_attendance=false`: לא נכללים בדוח פערים ולא תישלח אליהם הודעת חוסרים. ההגדרה זמינה רק דרך תיק העובד.
