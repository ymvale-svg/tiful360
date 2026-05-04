
## מטרה

מערכת ניהול תפוגות מאוחדת לכל **נכסי החברה** – עם הבחנה בין נכס **מוקצה לעובד** לנכס **מוסדי**, מסמכים מצורפים לכל פריט, התראות בלוח הבקרה, חידוש בלחיצה, ומייל מתוזמן 14 יום לפני התפוגה.

---

## תיקון טרמינולוגי
כל הנכסים שייכים לחברה. ההבדל הוא רק בשיוך:
- **נכס מוקצה** (`is_assignable=true`) – ניתן לשייך ל־`current_owner_id` (רכב צמוד, מחשב, טלפון, תוכנה אישית).
- **נכס מוסדי** (`is_assignable=false`) – לא משוייך לאדם (פוליסות חברה, חוזי שכירות, אישורים).

---

## חלק 0 – שדה הבחנה בקטגוריה

### מיגרציה
- `ALTER TABLE asset_categories ADD COLUMN is_assignable BOOLEAN NOT NULL DEFAULT true`.

### Seed קטגוריות (לכל חברה, idempotent)

| קטגוריה | prefix | is_assignable | שדות מותאמים |
|---|---|---|---|
| רכב | CAR | true | מס' רישוי, יצרן/דגם/שנה, **תוקף רישיון רכב + טסט** (date), **תוקף ביטוח חובה + מקיף/ג'** (date), שם סוכן, טל' סוכן, אימייל סוכן, תאריך טיפול אחרון, ק"מ |
| פוליסות ביטוח חברה | CINS | **false** | מס' פוליסה, חברת ביטוח, סוג כיסוי (מבנה / כלים הנדסיים / עבודות קבלניות / צד ג' / אחריות מקצועית), **תוקף פוליסה** (date), סכום כיסוי, פרמיה, שם סוכן, טל' סוכן, אימייל סוכן |
| חוזי שכירות | LEASE | **false** | **כיוון חוזה** (list: "החברה שוכרת" / "החברה משכירה"), **כתובת/נכס**, **שם הצד השני** (משכיר אם שוכרים / שוכר אם משכירים), **ח"פ/ת"ז של הצד השני**, **תוקף חוזה** (date), תאריך תחילה, דמי שכירות חודשיים, מדד הצמדה, **איש קשר** (שם), **תפקיד איש קשר** (list: בעלים / מנהל נכס / עו"ד / מתווך / אחר), **טל' איש קשר**, **אימייל איש קשר**, הערות |
| אישורים ורישיונות חברה | CERT | **false** | סוג אישור (כיבוי אש / רישיון עסק / היתר רעלים / תו ישראלי), גורם מנפיק, **תוקף**, מס' אישור, איש קשר, טל' |
| טיפולים תקופתיים | MAINT | true | פריט/רכב משוייך, סוג טיפול, **תאריך טיפול הבא**, תדירות בחודשים, ספק, טל' ספק |

### השלכות UI – חוזי שכירות
- בדיאלוג הוספה/עריכה: כש־`כיוון חוזה = "החברה שוכרת"` → תווית הצד השני מוצגת כ"משכיר"; כש="החברה משכירה" → "שוכר".
- בטבלת הנכסים: עמודת "כיוון" עם Badge **שוכרים / משכירים**.
- פילטר חדש: סוג שיוך (הכל / מוקצים / מוסדיים) + עבור LEASE — תת־פילטר "שוכרים/משכירים".

### השלכות UI כלליות
- ב־`AddAssetDialog` / `EditAssetDialog`: כשהקטגוריה `is_assignable=false` – שדה "שייך לעובד" מוסתר ו־`current_owner_id` נשאר NULL. תווית "נכס מוסדי" ליד שם הקטגוריה.
- ב־`Assets.tsx`: Badge "מוסדי" על השורה.

---

## חלק 1 – מסמכים מצורפים לכל פריט

### Storage
- Bucket חדש פרטי: `asset-documents`.
- RLS: קריאה/כתיבה לפי שיוך חברה (כמו `assets`).

### מיגרציה
טבלה חדשה `asset_documents`:
```
id uuid pk
asset_id uuid not null
company_id uuid not null
document_type text  -- 'insurance_certificate' | 'signed_license' | 'contract' | 'invoice' | 'other'
document_label text
file_url text not null
file_name text not null
file_size_bytes bigint
expiry_date date    -- אופציונלי, אם המסמך עצמו פג
uploaded_by uuid
uploaded_at timestamptz default now()
notes text
```
RLS:
- SELECT: כל מי שרואה את הנכס.
- INSERT/UPDATE/DELETE: admin / operations / it_manager.

### UI
- בכרטיס הפריט: סקשן/טאב **"מסמכים מצורפים"**.
- "העלה מסמך" → סוג, תווית, קובץ, תאריך תפוגה (אופציונלי).
- רשימת מסמכים: שם, סוג, גודל, תאריך העלאה, badge תפוגה, הורדה/מחיקה.
- **מסמך עם `expiry_date` מצטרף אוטומטית להתראות התפוגה** (חלק 2).

---

## חלק 2 – התראות תפוגה בלוח הבקרה + חידוש בלחיצה

### מקורות תפוגה (מאוחדים)
1. `assets.expiry_date`.
2. כל שדה `date` ב־`category_fields` ששמו תואם רגקס: `/תפוגה|תוקף|טסט|ביטוח|טיפול|רישיון|חוזה/`.
3. `asset_documents.expiry_date`.

### פונקציית DB
`get_expiring_assets(_company_id uuid, _days_ahead int default 14)` – SECURITY DEFINER, search_path=public.
מחזירה: `asset_id, asset_name, asset_code, category_name, is_assignable, source_type` (`asset|custom_field|document`), `source_id, field_key, field_label, expiry_date, days_left, owner_name, lease_direction` (אם רלוונטי).

### Hook
`useExpiringAssets(daysAhead = 14)` ב־`useData.ts`.

### Dashboard
- כרטיס חדש **"תוקפים מתקרבים (14 יום)"** – שורות לחיצות.
- צבעים: ≤0 אדום (פג!), ≤3 כתום, ≤14 צהוב.
- תגית "מוסדי / מוקצה ל: שם / שוכרים / משכירים".

### Alerts
- סקשן "תוקפים מתקרבים" עם סינון.
- כפתור "שלח התראות תפוגה עכשיו".

### דיאלוג חדש – `RenewExpiryDialog.tsx`
- מציג: שם פריט, תווית השדה (כולל "מסמך: אישור ביטוח" כשרלוונטי), תאריך נוכחי, מחזיק/מוסדי/כיוון חוזה.
- שדה תאריך חדש + הערות.
- אופציה "החלף קובץ" (כש־`source_type='document'`) – מעלה חדש ומעדכן `file_url` + `expiry_date`.
- "עדכן" → מעדכן את המקור המתאים, רושם ב־`activity_log`, ו־invalidate.

---

## חלק 3 – מייל אוטומטי 14 יום לפני התפוגה (חד־פעמי)

- `ALTER TABLE companies ADD COLUMN operations_emails TEXT` (CSV) + UI בהגדרות.
- Edge Function `send-expiry-notice` – `pg_cron` יומי 08:00.
- שולח רק על פריטים ש־`days_left = 14` בדיוק → התראה חד־פעמית.
- אגד פריטים של אותו יום למייל אחד.
- נמענים: `companies.operations_emails` (fallback: `payroll_emails`).
- אידמפוטנטיות: `message_id = expiry-notice-<source_type>-<source_id>-<expiry_date>`.

### תוכן המייל
- כותרת: "תוקף יפוג בעוד 14 יום – [שם פריט]"
- פרטים: שם, קוד, קטגוריה, סוג תוקף, תאריך, מחזיק/מוסדי.
- CAR/CINS – בלוק **"פרטי סוכן ביטוח"** (שם, `tel:`, `mailto:`).
- LEASE – בלוק **"פרטי החוזה"**: כיוון (שוכרים/משכירים), נכס/כתובת, צד שני, איש קשר + תפקיד + טל' לחיץ + אימייל.
- CERT/MAINT – בלוק **"איש קשר"** עם טל' לחיץ.
- קישור ישיר לפריט + הורדת מסמך (כש־source=document).

---

## טכני – סדר ביצוע

1. **מיגרציה**:
   - `asset_categories.is_assignable`.
   - `companies.operations_emails`.
   - `asset_documents` + RLS.
   - Storage bucket `asset-documents` + policies.
   - `get_expiring_assets()`.
   - Seed 5 קטגוריות + שדות (כולל "כיוון חוזה" ב־LEASE), idempotent.

2. **Edge Function** `send-expiry-notice` + `pg_cron`.

3. **Frontend**:
   - `useExpiringAssets`.
   - `RenewExpiryDialog.tsx`, `AssetDocumentsSection.tsx`.
   - Dashboard: כרטיס תוקפים.
   - Alerts: סקשן + סינון + כפתור שליחה ידנית.
   - AddAssetDialog/EditAssetDialog: הסתרת "שייך לעובד" עבור `is_assignable=false`; תווית דינמית "משכיר/שוכר" ב־LEASE.
   - Assets.tsx: פילטר סוג שיוך + תת־פילטר LEASE + Badges.
   - Settings: שדה Operations Emails.

4. **בדיקה ידנית**:
   - חוזה שכירות "שוכרים" עם תוקף עוד 14 יום → Badge נכון, מייל עם פרטי משכיר.
   - חוזה "משכירים" → Badge "משכירים", מייל עם פרטי שוכר.
   - אישור ביטוח כקובץ עם תפוגה → התראה נפרדת + הורדה במייל.
   - חידוש בלחיצה (כולל החלפת קובץ).

---

מאשר? עם האישור עוברים ל־Build ומתחילים מהמיגרציה.
