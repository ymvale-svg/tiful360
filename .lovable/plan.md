
המשתמש אישר את שני הפרטים. סיכום מעודכן ומשולב לכל המהלך (בקשות חופשה/מחלה + אימיילים אוטומטיים):

## 1. סכימה (מיגרציה)

**טבלה חדשה `leave_requests`**: id, company_id, employee_id, manager_id (snapshot), request_type (`vacation`/`sick`/`personal`/`other`), start_date, end_date, total_days, reason, attachment_url, status (`pending`/`approved`/`rejected`/`cancelled`), manager_note, reviewed_by, reviewed_at, signed_pdf_url, manager_notified_at, payroll_notified_at, created_at, updated_at.

**הרחבת `companies`**: הוספת `payroll_emails TEXT` (כתובת אחת או כמה מופרדות בפסיק).

**Buckets פרטיים חדשים**: `leave-attachments` (אישורי מחלה), `leave-documents` (PDF טפסים חתומים).

**RLS**:
- עובד: SELECT/INSERT/UPDATE(cancel) רק על שלו (`linked_user_id`).
- מנהל ישיר: SELECT/UPDATE על כפיפים (`employees.direct_manager_id`).
- Admin/IT של החברה: גישה מלאה.
- Storage policies מקבילות לפי `employee_id` בנתיב.

## 2. תשתית אימייל

- שימוש בתשתית הקיימת (`process-email-queue` + `email-assets`).
- בדיקת דומיין מוגדר → אם לא, פתיחת זרימת הגדרת דומיין.
- Edge function חדשה `send-leave-request-email` → מקבלת `request_id` + `event` (`submitted`/`approved`/`rejected`), מחוללת PDF במקרה אישור, מעלה ל-`leave-documents`, ומכניסה לתור.

**תבניות (HTML, RTL, ממותג)**:
| תבנית | נמען | טריגר |
|---|---|---|
| `leave_submitted_to_manager` | מנהל ישיר | חופשה/אישי/אחר → "פתח לאישור" |
| `leave_sick_notice_to_manager` | מנהל ישיר | מחלה (אינפורמטיבי, מצורף אישור אם הועלה) |
| `leave_approved_to_payroll` | `companies.payroll_emails` (מפוצל בפסיק) | אישור — PDF חתום + אישור מחלה כ-attachments |
| `leave_approved_to_employee` | העובד | אישור |
| `leave_rejected_to_employee` | העובד | דחייה (כולל סיבה) |

## 3. UI — צד עובד (`EmployeePortal.tsx`)

קלף "בקשות חופשה ומחלה":
- כפתור "בקשה חדשה" → `NewLeaveRequestDialog`: סוג, תאריכים (חישוב ימים אוטו'), סיבה, העלאת קובץ.
- **מחלה ללא קובץ**: לא חוסם — מציג AlertDialog לאישור: "זיכוי הימים מותנה בהמצאת אישור מחלה לימים שהוצהרו. להמשיך?". רק לאחר אישור — שליחה.
- רשימת בקשות עם סטטוס + תגובת מנהל + כפתור ביטול ל-pending.

## 4. UI — צד מנהל

**א. עמוד חדש `LeaveRequests.tsx`** (סיידבר עם badge ל-pending) — רשימת בקשות לאישור, פילטר סטטוס, צפייה בקובץ, כפתורי אשר/דחה + הערה.

**ב. טאב חדש בתיק העובד** — היסטוריית כל הבקשות + הורדת קבצים + הורדת PDF חתום.

## 5. UI — מסך הגדרות חברה

שדה "כתובות אימייל מחלקת שכר" עם helper text: "ניתן להזין מספר כתובות מופרדות בפסיק". ולידציה לכל כתובת.

## 6. Hooks

`useMyLeaveRequests`, `useTeamLeaveRequests`, `useEmployeeLeaveRequests(id)`, `useCreateLeaveRequest` (כולל upload), `useReviewLeaveRequest` (מפעיל edge function), `useCancelLeaveRequest`.

## 7. קבצים

| קובץ | פעולה |
|---|---|
| מיגרציה SQL | חדש — טבלה, enums, `companies.payroll_emails`, buckets + policies |
| `supabase/functions/send-leave-request-email/index.ts` | חדש |
| `src/lib/generateLeaveRequestPdf.ts` | חדש |
| `src/components/NewLeaveRequestDialog.tsx` | חדש (כולל AlertDialog למחלה ללא קובץ) |
| `src/components/LeaveRequestsList.tsx` | חדש |
| `src/components/ReviewLeaveRequestDialog.tsx` | חדש |
| `src/pages/LeaveRequests.tsx` | חדש |
| `src/pages/EmployeePortal.tsx` | עריכה |
| `src/pages/EmployeeDetail.tsx` | עריכה — טאב חדש |
| `src/pages/Settings.tsx` | עריכה — שדה payroll_emails |
| `src/components/AppSidebar.tsx` | עריכה — פריט + badge |
| `src/App.tsx` | עריכה — route |
| `src/hooks/useMutations.ts` + `useData.ts` | עריכה |

## טיפול בקצוות
- מנהל ללא אימייל ב-`employees.email` → toast אזהרה למבצע + רישום ב-`activity_log`, הבקשה נשמרת.
- אין `payroll_emails` בעת אישור → toast "האישור נשמר; יש להגדיר כתובות שכר בהגדרות החברה". פעולה לא נחסמת.
- כשלון שליחת אימייל לא חוסם DB.
