# אינטגרציות רוחביות + מודל תפוגות per-domain

## עקרון מנחה חדש (לפי הבהרת המשתמש)

**אין שדה תפוגה גנרי אחד**. כל דומיין מגדיר את התפוגות הרלוונטיות שלו כשדות ראשונה (first-class), עם שמות, אייקונים, סף התראה ואחראי טיפול משלו. הסורק המרכזי (`get_expiring_assets`) מצרף את כולן לתצוגה אחידה בלוח הבקרה.

### מטריצת תפוגות לפי דומיין

| דומיין | שדות תפוגה | אחראי טיפול |
|---|---|---|
| נכסים פיזיים | אחריות יצרן, ביטוח רכוש (אופציונלי) | IT / תפעול |
| רכב | טסט שנתי, רישוי, ביטוח חובה, ביטוח מקיף, רישיון נהיגה של הנהג | תפעול |
| גישות דיגיטליות | תפוגת סיסמה, תפוגת רישיון/seat, MFA renewal | IT |
| רשיונות תוכנה | תאריך חידוש, תאריך תפוגה, תאריך תשלום הבא | IT / כספים |
| ביטוחים (מוסדי) | תאריך פקיעה, תאריך חידוש פרמיה | משפטי / כספים |
| הדרכות | תוקף תעודה, תאריך רענון נדרש | משאבי אנוש |
| נדל"ן (שכור/מניב) | סוף חוזה, תאריך אופציית הארכה, חידוש ביטוח מבנה | משפטי |

## 1. מבנה DB לתפוגות

**אופציה מועדפת — עמודות מפורשות בכל טבלת דומיין:**
- `vehicles.test_expiry`, `vehicles.license_expiry`, `vehicles.mandatory_insurance_expiry`, `vehicles.comprehensive_insurance_expiry`
- `digital_access.password_expires_at`, `digital_access.license_expires_at`
- `software_licenses.renewal_date`, `software_licenses.expiry_date`
- `insurance_policies.expiry_date`, `insurance_policies.next_premium_date`
- `trainings.certificate_expiry`, `trainings.refresh_due_date`
- `real_estate_contracts.contract_end`, `real_estate_contracts.option_extension_date`

**יתרון:** type-safe, ניתן להוסיף constraints, אינדקסים ייעודיים, ולא תלוי ב-heuristic על שמות שדות (תיקון לבעיה הקיימת ב-`get_expiring_assets` שמשתמשת ב-regex על שמות עבריים).

**גיבוי:** `category_fields` נשאר זמין לתפוגות אד-הוק שהלקוח מגדיר בעצמו (לא יוצגו בלוח הבקרה ללא הגדרה מפורשת של `is_expiry_field=true` בעמודה חדשה ב-`category_fields`).

## 2. הרחבת `get_expiring_assets`

הפונקציה תהפוך ל-UNION ALL מעל כל הדומיינים. כל ענף מחזיר את אותו schema אבל עם:
- `domain` חדש (`'physical' | 'vehicle' | 'digital' | 'license' | 'insurance' | 'training' | 'real_estate'`)
- `expiry_type` (`'vehicle_test'`, `'password'`, `'contract_end'`, וכו') — מחליף את `field_label` כמזהה יציב לסינון/קיבוץ
- `assignee_role` (מי אמור לטפל) — מאפשר לסנן את ה-Card לפי תפקיד המשתמש

## 3. לוח הבקרה — `ExpiringAssetsCard`

- קיבוץ אופציונלי לפי `domain` (טאבים: הכל / רכב / רישיונות / חוזים...)
- ניווט: לחיצה על שורה תוביל ל-`/assets/:domain/:id` (לא ל-`category` הישן)
- צבע/אייקון לפי `domain` במקום badge "מוסדי" בלבד

## 4. תיק עובד ↔ משאבים מוקצים

ללא שינוי מהגרסה הקודמת של התוספת: `get_employee_holdings(_employee_id)` יחזיר view מאוחד מ-`assets`, `digital_access`, `vehicles.assigned_to_employee_id`, `trainings.employee_id`, `software_licenses.assigned_to_employee_id`. תשמש גם את טאב "ציוד וגישות" וגם את `create_offboarding_checklist`.

## 5. שאלות הכרעה לפני שלב 1

1. **תפוגות per-domain כעמודות מפורשות** — מאשר? (חלופה: JSONB אחיד `expiries: [{type, date, notify_days}]` בכל טבלה — פחות type-safe אבל גמיש).
2. **הגדרות התראה (`notify_days_before`)** — לקבע ברמת הדומיין (קוד), ברמת הקטגוריה (DB), או ברמת הפריט הבודד?
3. **מיגרציית תפוגות קיימות** מ-`assets.expiry_date` ו-`custom_fields` לעמודות הדומיין החדשות — אוטומטית במיגרציה, או ידנית בממשק?
