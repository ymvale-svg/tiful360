## דוח פערי החתמות + שליחה מרוכזת + תיקונים ישירים לשכר

### חלק 1 — ימי עבודה לעובד
- `employees.work_days smallint[]` ברירת מחדל `{0,1,2,3,4}` (ראשון–חמישי).
- ב-`EditEmployeeDialog`: צ׳קבוקסים א׳–שבת — ברירת המחדל א׳–ה׳ אלא אם הוגדר אחרת.

### חלק 2 — חגים
- מיגרציה: טבלה חדשה `public.company_holidays(id, company_id, holiday_date date, name text)` עם RLS — צפייה לכל מי שיש לו גישה לחברה, עריכה ל-`admin`/`payroll`.
- Seed ראשוני של חגי ישראל לשנים 2025–2027 (ראש השנה, יום כיפור, סוכות, פסח, יום העצמאות, שבועות).
- UI ב-`PortalSettingsTab` (או טאב הגדרות חברה): רשימת חגים עם הוספה/מחיקה.

### חלק 3 — פונקציית DB `get_attendance_gaps(_from date, _to date)`
מחזירה `(employee_id, full_name, email, gap_date, gap_type, punch_count)` עבור ימים שב-`work_days` של העובד.
**מסננת החוצה ימים שבהם:**
- קיים `leave_requests` עם `status='approved'` שטווח `start_date..end_date` כולל את התאריך (כל סוגי החופשה: חופש, מחלה, מילואים וכו').
- התאריך קיים ב-`company_holidays` של החברה.

מסווגת `gap_type`:
- `empty` — 0 החתמות.
- `odd` — מספר אי-זוגי.

הרשאות: `payroll` / `admin` / `super_admin`. ספירה לפי `Asia/Jerusalem`, רק עובדים פעילים.

### חלק 4 — דוח UI `AttendanceGapsReport.tsx`
סקשן חדש ב-`AttendanceClockTab`:
- בורר טווח (ברירת מחדל: חודש קלנדרי קודם).
- טבלה מקובצת לפי עובד עם פירוט תאריכים + סוג פער + שעות קיימות.
- כפתור "שלח מייל לעובד" לכל שורה.
- כפתור ראשי "שלח לכל העובדים עם פערים (N)" — דיאלוג אישור + שליחה מרוכזת.
- ייצוא לאקסל.

### חלק 5 — תבנית מייל `attendance-gaps.tsx`
React Email תחת `supabase/functions/_shared/transactional-email-templates/`:
- טבלה: תאריך + יום + סוג פער + שעות קיימות.
- CTA "בקשת תיקון" → `{APP_URL}/portal?tab=attendance&correction=open&date=<first_gap>`.
- רשומה ב-`registry.ts`. `idempotencyKey: attendance-gaps-{employee_id}-{from}-{to}`.

### חלק 6 — Edge function `send-attendance-gaps`
- קלט: `{ from, to, employee_ids?: string[] }`.
- שולפת מ-`get_attendance_gaps`, מקבצת לפי עובד, ולכל אחד עם email קוראת ל-`send-transactional-email`.
- מחזירה `{ queued, skipped_no_email }`. מוגנת ב-JWT + role check.

### חלק 7 — פורטל העובד
`EmployeePortal.tsx`: בקריאת `correction=open` נפתח `AttendanceCorrectionDialog` אוטומטית עם `date` ממולא מראש.

---

## חלק 8 — תיקוני נוכחות → ישר לשכר

### 8.1 הגדרת חברה
- `companies.attendance_corrections_auto_approve boolean default false`.
- Switch ב-`PortalSettingsTab`: "תיקוני נוכחות עוברים אוטומטית לשכר ללא אישור מנהל".

### 8.2 שדות חדשים על `attendance_corrections`
- `applied_at timestamptz null`.

### 8.3 פונקציית DB `apply_attendance_correction(_correction_id)` — SECURITY DEFINER
**רק הכיוון המבוקש מוחלף:**
- `requested_check_in` מולא → מחיקת כל ה-`in` של העובד באותו יום (source != 'portal_remote') + הכנסת punch חדש (`direction='in'`, `source='correction'`, `status='approved'`, `raw_payload={correction_id}`).
- `requested_check_out` מולא → אותו דבר ל-`out`.
- שדה לא מולא → לא נוגעים.
- מסמנת `applied_at = now()`. `dedup_punch_5min` מסנן כפילויות.

### 8.4 טריגר על `attendance_corrections` (AFTER INSERT OR UPDATE)
- INSERT עם חברה ש-`auto_approve=true` → `status='approved'`, `reviewed_at=now()`, ואז `apply_attendance_correction`.
- UPDATE שבו `status` הפך ל-`approved` ו-`applied_at IS NULL` → `apply_attendance_correction`.

### 8.5 שינויי UI
- `AttendanceCorrectionDialog`: כשבחברה `auto_approve=true`, הודעה: "התיקון הוחל מיידית על דוח הנוכחות".
- `AttendanceCorrections.tsx`: badge "הוחל על השכר" כשיש `applied_at`.

---

### קבצים
**חדשים:** `AttendanceGapsReport.tsx`, `supabase/functions/_shared/transactional-email-templates/attendance-gaps.tsx`, `supabase/functions/send-attendance-gaps/index.ts`, רכיב ניהול חגים `CompanyHolidaysSection.tsx`, מיגרציה מקיפה.
**עריכה:** `AttendanceClockTab.tsx`, `EditEmployeeDialog.tsx`, `EmployeePortal.tsx`, `AttendanceCorrectionDialog.tsx`, `AttendanceCorrections.tsx`, `PortalSettingsTab.tsx`, `registry.ts`.

### הערות
- חגים מותאמים לחברה (לא גלובלי) — מאפשר חברות עם לוח שונה.
- חופשות/מחלה מזוהות דרך `leave_requests` עם `status='approved'` בלבד; pending לא מסנן.
- חצי-יום חופש (`total_days < 1`) — לא מטופל בנפרד; אם יש leave מאושר ביום, היום לא נחשב כפער.