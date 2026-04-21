
## תכנית סופית: העלאת תלושי שכר חודשית — מכוילת לפורמט מיכפל

### מה למדתי מהתלוש לדוגמה

הפורמט של מיכפל מאוד עקבי ומובנה. זיהיתי את כל השדות הקריטיים:

| שדה | תבנית בתלוש | Regex (מותאם) |
|---|---|---|
| **חודש/שנה** | `תלוש שכר לחודש 03/2026` | `תלוש שכר לחודש\s+(\d{2})\/(\d{4})` |
| **מס׳ עובד מיכפל** | `מספר העובד: 0024` | `מספר העובד:\s*(\d+)` |
| **ת.ז.** | `מספר זהות: 300724796` | `מספר זהות:\s*(\d{9})` |
| **שם עובד** | בלוק "לכבוד" | שורה אחרי `לכבוד` |
| **מס׳ חברה במיכפל** | `חברה: 002 - אשל הירדן...` | `חברה:\s*(\d+)\s*-\s*(.+)` |
| **שכר ברוטו** | `סה"כ תשלומים 15483.25` | `סה"כ תשלומים\s+([\d,]+\.\d{2})` |
| **שכר נטו** | `שכר נטו 12932.25` | `שכר נטו\s+([\d,]+\.\d{2})` |
| **לתשלום** | `לתשלום 12932.25` | `לתשלום\s+([\d,]+\.\d{2})` |
| **יתרת חופשה** | בלוק `חשבון חופשה` → `יתרה חדשה 1.99` | פענוח מיקומי של הבלוק |
| **יתרת מחלה** | בלוק `חשבון מחלה` → `יתרה חדשה 22.50` | פענוח מיקומי של הבלוק |
| **ימי עבודה בחודש** | `ימי עבודה 17` | `ימי עבודה\s+(\d+)` |
| **שעות עבודה** | `שעות עבודה 135.6` | `שעות עבודה\s+([\d.]+)` |

**הערה חשובה על יתרות חופשה ומחלה:**
התלוש מכיל **שני בלוקים** עם 4 שורות זהות (יתרה קודמת / צבירה ח.ז. / ניצול ח.ז. / יתרה חדשה). הפענוח יזהה את הכותרות `חשבון חופשה` ו-`חשבון מחלה` ויקרא את המספר אחרי `יתרה חדשה` בכל בלוק בנפרד.
- בדוגמה: יתרת חופשה חדשה = **1.99**, יתרת מחלה חדשה = **22.50**.

---

### ארכיטקטורה (סופית)

#### 1. סכמת DB

**עמודות חדשות ב-`employees`:**
- `michpal_code` (text, nullable, unique לכל חברה) — מס׳ העובד במיכפל (למשל `0024`).
- `vacation_balance` (numeric, default 0)
- `sick_balance` (numeric, default 0)
- `balances_updated_at` (timestamptz, nullable)
- `balances_source` (text, nullable) — `payslip` / `manual`

**טבלה חדשה `payslips`:**
| עמודה | טיפוס |
|---|---|
| `id` | uuid PK |
| `company_id` | uuid (RLS) |
| `employee_id` | uuid (nullable — אם לא זוהתה התאמה) |
| `michpal_code_detected` | text |
| `period_year` | int |
| `period_month` | int |
| `pdf_url` | text (path ב-Storage) |
| `vacation_balance` | numeric |
| `sick_balance` | numeric |
| `gross_salary` | numeric |
| `net_salary` | numeric |
| `work_days` | int |
| `work_hours` | numeric |
| `extraction_status` | text (`success` / `partial` / `failed` / `unmatched`) |
| `extraction_notes` | text |
| `batch_id` | uuid (לקיבוץ העלאות חודשיות) |
| `created_at`, `created_by` | |

- אינדקס ייחודי: `(employee_id, period_year, period_month)` כש-employee_id לא NULL.
- **RLS:** צוות החברה (admin/it_manager) — CRUD מלא; עובד (`linked_user_id`) — SELECT על התלושים שלו בלבד.

**Storage bucket:** `payslips` (פרטי). מבנה: `{company_id}/{year}-{month}/{michpal_code}_{employee_name}.pdf`. הורדה דרך `createSignedUrl`.

**טבלת `payslip_batches` (להעלאות חודשיות):**
- `id`, `company_id`, `period_year`, `period_month`, `total_pages`, `matched_count`, `unmatched_count`, `failed_count`, `original_filename`, `created_by`, `created_at`.

#### 2. Edge Function `split-payslips`

**מיקום:** `supabase/functions/split-payslips/index.ts` (`verify_jwt = true`).

**זרימה:**
1. מקבל POST עם: PDF base64/binary + `company_id` + `period_year` + `period_month`.
2. שולף `employees` של החברה עם `michpal_code` → Map.
3. **קריאת PDF:**
   - `pdf-lib` (Deno) לפיצול לעמודים.
   - `unpdf` (Deno-native, תומך עברית) או `pdfjs-dist` לחילוץ טקסט מכל עמוד.
4. **לכל עמוד:**
   - Regex על מספר עובד + תאריך תלוש.
   - אם עמוד הבא הוא המשך (אותו `מספר העובד` או `דף 2 מתוך 2`) — ממזג ל-PDF אחד עם `pdf-lib`.
   - חילוץ כל השדות לפי הטבלה למעלה.
   - חיפוש ב-Map לפי `michpal_code` → קישור ל-`employee_id`.
5. **שמירה:**
   - העלאה ל-`payslips/{company_id}/{year}-{month}/{michpal_code}.pdf`.
   - INSERT ל-`payslips` (UPSERT לפי `(employee_id, year, month)`).
   - UPDATE ל-`employees`: `vacation_balance`, `sick_balance`, `balances_updated_at = now()`, `balances_source = 'payslip'`.
6. **דו"ח החזרה:**
```json
{
  "batch_id": "...",
  "total_pages": 120,
  "matched": 115,
  "unmatched_codes": ["0099", "0123"],
  "failed_pages": [47],
  "balance_changes": [
    { "employee_name": "וייל ישראל מאיר", "vacation_old": 1.0, "vacation_new": 1.99, ... }
  ]
}
```

#### 3. רכיבי UI

**א. `PayslipsUploadDialog.tsx` (חדש)**
- מיקום קריאה: כפתור חדש ב-`Settings` בלשונית חדשה **"שכר ותלושים"**, וגם ב-`EmployeeDetail` (להעלאת תלוש בודד).
- שדות: בחירת חודש/שנה (ברירת מחדל = חודש קודם) + dropzone ל-PDF.
- בזמן עיבוד: progress bar עם שלבים: "קורא PDF" → "מפצל" → "מתאים לעובדים" → "שומר".
- בסיום: דו"ח עם 3 בלוקים — ✅ הצלחות, ⚠️ קודי מיכפל לא מוכרים (עם כפתור "שייך ידנית" לכל אחד), ❌ עמודים שנכשלו (עם הורדת PDF המקורי).

**ב. `EmployeePayslipsTab.tsx` (חדש) — לשונית חדשה ב-`EmployeeDetail`**
- 3 כרטיסיות סיכום בראש: יתרת חופשה · יתרת מחלה · עודכן ב-(תאריך התלוש האחרון).
- טבלה כרונולוגית: חודש · שנה · ברוטו · נטו · יתרת חופשה · יתרת מחלה · ימי עבודה · כפתור הורדה.
- אם יש פער בין יתרת התלוש למה שמוזן ידנית בטבלת חופשות → באנר רך עם "סנכרן לפי תלוש".

**ג. עדכון `Settings.tsx` — לשונית חדשה "שכר ותלושים"**
- כפתור "העלה תלושים חודשיים".
- היסטוריית באצ'ים (`payslip_batches`) עם סטטוס לכל חודש שהועלה.
- כפתור "ייצא Excel — מצב מספרי מיכפל" לעובדים בלי `michpal_code`.

**ד. `AddEmployeeDialog` + `EditEmployeeDialog` (עדכון)**
- שדה חדש "מס׳ עובד במיכפל" (`michpal_code`).

**ה. `ImportExcelDialog` (עדכון)**
- מיפוי עמודה אופציונלי לעמודה `michpal_code` בייבוא Excel — לפעולת שיוך חד-פעמית של מספרי מיכפל לעובדים קיימים.

**ו. `usePayslips.ts` (חדש)**
- `usePayslips(employeeId)`, `useUploadPayslipsBatch()`, `useUnmatchedPayslips(batchId)`, `useAssignPayslipToEmployee()`.

**ז. הצגה לעובד** (אם יש פורטל עובד פעיל)
- ב-`EmployeePortal` — לשונית "תלושי השכר שלי" עם הורדה.

---

### בקרות ואבטחה
- ה-edge function דורש שהמשתמש המעלה הוא `admin`/`it_manager` של החברה (בדיקה מול `user_roles`).
- Storage bucket פרטי לחלוטין; הורדה רק דרך `createSignedUrl` עם תוקף 5 דקות.
- כל העלאה נרשמת ב-`activity_log` עם `batch_id`.

---

### קבצים שייווצרו / יעודכנו

1. **מיגרציה SQL:** `payslips`, `payslip_batches`, 5 עמודות ל-`employees`, RLS, bucket `payslips`.
2. `supabase/functions/split-payslips/index.ts` (חדש) + `deno.json`.
3. `supabase/config.toml` — רישום הפונקציה.
4. `src/components/PayslipsUploadDialog.tsx` (חדש)
5. `src/components/EmployeePayslipsTab.tsx` (חדש)
6. `src/hooks/usePayslips.ts` (חדש)
7. `src/pages/EmployeeDetail.tsx` (תוספת לשונית)
8. `src/pages/Settings.tsx` (לשונית "שכר ותלושים")
9. `src/components/AddEmployeeDialog.tsx` + `EditEmployeeDialog.tsx` (שדה michpal_code)
10. `src/components/ImportExcelDialog.tsx` (מיפוי michpal_code)

---

### תשובות שאני צריך לפני התחלה

1. **מספרי מיכפל לעובדים קיימים** — האם יש לך קובץ Excel/דוח ממיכפל שמקשר שם עובד למספר פנימי? אם כן, אבנה גם פעולת ייבוא חד-פעמית. אם לא — נצטרך טופס שיוך ידני (יתבצע אוטומטית בהעלאה הראשונה דרך הדו"ח של "קודים לא מוכרים").

2. **הצגת תלושים לעובד** — האם תרצה שגם העובד יראה את התלושים שלו ב-`EmployeePortal`, או רק מנהל/חשב שכר?

3. **רגישות הנטו** — האם להציג את שכר ה**נטו** והברוטו בלשונית של תיק העובד למנהלים, או לסנן רק לתפקיד `admin` (ולא `it_manager`)? תלושים זה מידע רגיש.
