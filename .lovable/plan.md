

## טופס 101 — זרימה מלאה: יצירה ע"י השכר → חתימה ע"י העובד → שמירה ושליחה

### זרימת המשתמש המעודכנת

**1. חשבות השכר (אדמין):**
- במסך **שכר ותלושים** → טאב חדש **"טפסי עובדים"** עם כפתור ראשי **"פתח טופס 101 לשנת 2026 לחתימה"** (בורר שנה).
- בלחיצה — דיאלוג עם:
  - בחירת עובדים (הכל / סינון לפי מחלקה / סימון ידני).
  - אופציה: "שלח גם לינק במייל" (ברירת מחדל ✓).
- המערכת יוצרת רשומת `tax_form_101` במצב `pending` לכל עובד נבחר.
- **טבלת מעקב** באותו מסך: עובד / שנה / סטטוס (ממתין / נחתם / נשלח לשכר) / תאריך פתיחה / תאריך חתימה / כפתור הורדה (לחתומים) / כפתור "שלח תזכורת".

**2. עובד בפורטל:**
- בדשבורד הפורטל — **באנר התראה בולט**: "טופס 101 לשנת 2026 ממתין לחתימה" + כפתור "מלא וחתום".
- בלחיצה נפתח **דיאלוג רב-שלבי (5 שלבים)** עם prefill מהפרופיל:
  - פרטים אישיים | כתובת ומצב משפחתי | ילדים | הצהרות והכנסות | חתימה.
  - שדות שמולאו אוטומטית מסומנים בבדג' "מולא מהפרופיל" — ניתנים לעריכה.
  - שמירת טיוטה ב-localStorage כל 5 שניות.
- בסיום — **תצוגה מקדימה של ה-PDF** + כפתור "אשר ושלח".
- בלחיצה: PDF נוצר על בסיס תבנית `tofes-101.pdf` עם שתילת ערכים+חתימה, נשמר ב-bucket, וכן נשלח אוטומטית למחלקת השכר עם **ה-PDF כ-attachment אמיתי דרך Resend**.

**3. אזור "הטפסים שלי" בפורטל:**
- טאב חדש **"הטפסים שלי"** (או הוספה לטאב מסמכים קיים) — רשימת כל טופסי 101 לפי שנה: סטטוס + תאריך חתימה + הורדה.

**4. לינק למייל ישירות לאזור אישי:**
- אופציה לשכר לשלוח לעובד ספציפי **לינק חתום** (token חד-פעמי) שמוביל למסך `/portal/tax101/:token`.
- הלינק לא דורש login — מאמת את הטוקן ופותח את דיאלוג המילוי לעובד.
- אחרי חתימה, הטוקן נשרף.

### מבנה טכני

**1. מיגרציה ל-DB**
- טבלה `tax_form_101`:
  - `id, employee_id, company_id, tax_year, status` (`pending`|`signed`|`sent`)
  - `form_data` (jsonb), `signature_data` (text/base64), `pdf_url`
  - `created_by` (uuid — מי פתח את הטופס), `created_at`
  - `signed_at, sent_at, sent_to[]`
  - `access_token` (uuid, unique, nullable), `token_expires_at`
- טבלה `employee_dependents`: `employee_id, full_name, id_number, birth_date, is_in_custody, receives_allowance`
- שדות חדשים ל-`employees`: `gender, street, house_number, city, postal_code, po_box, country_of_birth, aliyah_date, marital_status, is_israeli_resident, health_fund_member`
- Bucket חדש `tax-forms-101` (פרטי) + RLS:
  - עובד: `SELECT/UPDATE` רק על הרשומה שלו ב-`pending`.
  - payroll/admin: `SELECT/INSERT/UPDATE` על כל החברה שלו.
  - super_admin: הכל.

**2. תבנית PDF + מחולל**
- `src/assets/tofes-101-template.pdf` — הקובץ שהעלית.
- `src/lib/tax101FieldMap.ts` — מפת קואורדינטות `{ page, x, y, fontSize, type }` לכל שדה.
- `src/lib/generateTax101Pdf.ts` — `pdf-lib` + `@pdf-lib/fontkit` + פונט עברי, שותל ערכים וחתימה מעל התבנית.

**3. רכיבי UI חדשים**
- `src/components/Tax101Dialog.tsx` — דיאלוג מילוי 5 שלבים (משמש גם בפורטל וגם דרך לינק טוקן).
- `src/components/payroll/Tax101AdminTab.tsx` — טאב "טפסי עובדים" במסך שכר: יצירה בכמות, טבלת מעקב, שליחת תזכורות.
- `src/components/payroll/CreateTax101BatchDialog.tsx` — דיאלוג בחירת עובדים + שנה.
- `src/components/portal/Tax101Banner.tsx` — באנר התראה בדשבורד.
- `src/components/portal/MyTax101FormsList.tsx` — רשימת טפסים קודמים לעובד.
- `src/pages/Tax101TokenPage.tsx` — דף עצמאי `/portal/tax101/:token` למילוי דרך לינק.
- Hook `src/hooks/useTax101.ts` — שאילתות ומוטציות.

**4. Edge Functions**
- `supabase/functions/send-tax101-email/index.ts`:
  - מקבל `form_id`, מאומת JWT.
  - שולף PDF מ-Storage → ממיר ל-base64.
  - שולח דרך **Resend API** (ישירות, עם ה-key שסופק) עם attachment אמיתי לכתובות `companies.payroll_emails` + עותק לעובד.
  - מעדכן `sent_at` + `sent_to[]`.
- `supabase/functions/send-tax101-invite/index.ts`:
  - מקבל `form_id`.
  - מייצר `access_token` (uuid) + `token_expires_at` (30 יום).
  - שולח לעובד מייל דרך Resend עם לינק `https://tiful360.com/portal/tax101/{token}`.

**5. עדכוני קבצים קיימים**
- `src/pages/Payroll.tsx` — הוספת טאב "טפסי עובדים".
- `src/pages/EmployeePortal.tsx` — הוספת באנר 101 + טאב/סקציה "הטפסים שלי".
- `src/App.tsx` — route חדש `/portal/tax101/:token` (פתוח, ללא ProtectedRoute).
- `supabase/config.toml` — בלוקים ל-2 ה-functions החדשים.

### secret נדרש
- `RESEND_API_KEY` = `re_aoAXkfn2_PZfU27DxNWQtriXD2kaQyLPp` (יתווסף לסודות הפרויקט בעת המימוש).

### עיצוב
- דיאלוג RTL רחב (`max-w-3xl`), פס התקדמות עליון.
- באנר 101 בדשבורד: רקע צהבהב/דגשי תשומת לב, אייקון מסמך, כפתור CTA בולט.
- טבלת מעקב לשכר עם בדג'ים צבעוניים לסטטוס (אפור=ממתין, ירוק=נחתם, כחול=נשלח).
- לינק טוקן: דף נקי ממותג עם לוגו החברה + הסבר קצר ופתיחת הדיאלוג.

### למה Resend ולא Lovable Email
- **Lovable Email לא תומך ב-attachments** — חובה לשלוח את ה-PDF החתום כקובץ מצורף אמיתי.
- שימוש ב-Resend מבודד **רק לטופס 101** — שאר המיילים (auth, חופשות, payroll) ימשיכו דרך התשתית הקיימת.

### קבצים מושפעים
- מיגרציה (טבלאות, שדות, bucket, RLS)
- `src/assets/tofes-101-template.pdf` (חדש)
- `src/lib/tax101FieldMap.ts` (חדש)
- `src/lib/generateTax101Pdf.ts` (חדש)
- `src/hooks/useTax101.ts` (חדש)
- `src/components/Tax101Dialog.tsx` (חדש)
- `src/components/payroll/Tax101AdminTab.tsx` (חדש)
- `src/components/payroll/CreateTax101BatchDialog.tsx` (חדש)
- `src/components/portal/Tax101Banner.tsx` (חדש)
- `src/components/portal/MyTax101FormsList.tsx` (חדש)
- `src/pages/Tax101TokenPage.tsx` (חדש)
- `src/pages/Payroll.tsx` (טאב חדש)
- `src/pages/EmployeePortal.tsx` (באנר + רשימה)
- `src/App.tsx` (route חדש)
- `supabase/functions/send-tax101-email/index.ts` (חדש)
- `supabase/functions/send-tax101-invite/index.ts` (חדש)
- `supabase/config.toml`
- secret חדש: `RESEND_API_KEY`

