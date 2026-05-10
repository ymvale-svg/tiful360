# רכבים — הסרת תאריך תפוגה כפול + התראות מייל לתפוגות

## 1. הסרת "תאריך תפוגה" האוניברסלי בקטגוריית רכב

ברכבים מופיעים בפועל שלושה תאריכי תפוגה — האוניברסלי מיותר, נסתיר אותו רק בקטגוריית CAR. שדות ה"רישיון/טסט" וה"ביטוח" המותאמים יישארו כרגיל.

קבצים:
- `src/components/AddAssetDialog.tsx` — הסתרת בלוק "תאריך תפוגה" כש-`selectedCategory?.prefix === "CAR"` (במצב single, במצב bulk-universal, ובעמודה הפר-עובד בטבלת bulk).
- `src/components/EditAssetDialog.tsx` — הסתרת אותו בלוק (קריאה+עריכה) ב-CAR.
- בדיקה ב-`AssetDetailView.tsx` — להסתיר גם בתצוגה ב-CAR.

הנתונים הקיימים ב-`assets.expiry_date` של רכבים יישארו ב-DB ולא יימחקו.

## 2. תשובה: כן — ההתראות הקיימות מכסות את שני התאריכים

הפונקציה `get_expiring_assets` מזהה אוטומטית את כל השדות המותאמים מסוג `date` ששמם תואם לדפוס `תפוגה|תוקף|טסט|ביטוח|טיפול|רישיון|חוזה|סיסמ`. לכן "תוקף רישיון רכב וטסט" ו"תוקף ביטוח חובה ומקיף/צד ג" כבר מופיעים בכרטיס "תוקפים מתקרבים" וב-Alerts גם בלי השדה האוניברסלי.

## 3. התראות מייל אוטומטיות 14 יום לפני תפוגה

### הגדרות חברה (מסך הגדרות → ניתוב מיילים)
- שדה חדש בטבלת `companies`: `expiry_notification_emails` (text) — רשימת מיילים מופרדים בפסיקים. ברירת המחדל: ערך `operations_emails` של החברה.
- במסך **Settings** ניתן יהיה לערוך ידנית את הרשימה (כמו ה-`payroll_emails`/`it_emails` הקיימים).

### הגדרת ימים לפני תפוגה — לכל משאב בנפרד
- שדה חדש ב-`assets`: `notification_days_before` (integer, nullable) — אם NULL = ברירת מחדל 14.
- שדה חדש בטבלה `asset_categories`: `default_notification_days_before` (integer, nullable) — אם NULL ברמת הקטגוריה, נופל ל-14.
- היררכיה: ערך פר-משאב → ערך פר-קטגוריה → 14.
- בדיאלוגי הוספה/עריכה של פריט: שדה "התרעה X ימים לפני תפוגה" (placeholder = ברירת מחדל של הקטגוריה).
- ב-Category Manager: שדה "ימי התראה ברירת מחדל לקטגוריה".

### טבלת מעקב — מניעת ספאם
טבלה חדשה `expiry_notifications_sent`:
- `company_id`, `asset_id`, `field_key` (NULL לאוניברסלי, או `cf:<name>` לשדה מותאם, או `doc:<id>` למסמך)
- `expiry_date` (התאריך שעליו נשלחה ההתראה)
- `sent_at`
- מפתח ייחודי: `(asset_id, field_key, expiry_date)` — כל תפוגה שולחת מייל אחד בלבד. אם המשתמש מחדש (תאריך משתנה) — נשלח שוב כי זו רשומה אחרת.

### Edge Function חדשה: `notify-expiring-assets`
- רצה כל יום ב-07:00 שעון ישראל דרך `pg_cron` + `pg_net`.
- עוברת על כל החברות:
  1. שולפת את כל ההתראות מ-`get_expiring_assets(company_id, 30)` (טווח רחב — נסנן בקוד).
  2. מסננת לפי `notification_days_before` של המשאב/קטגוריה (כל פריט מופיע רק כש-`days_left == days_before`).
  3. מסננת החוצה את מה שכבר נשלח לפי `expiry_notifications_sent`.
  4. מקבצת לכל חברה למייל אחד מסכם — טבלה: שם פריט / קוד / סוג תפוגה / תאריך / ימים שנותרו / בעלים נוכחי / קישור ישיר לפריט.
  5. שולחת ל-`companies.expiry_notification_emails` (פיצול לפי פסיק) דרך תור המייל הפנימי (`enqueue_email` → `transactional_emails`).
  6. רושמת ל-`expiry_notifications_sent`.
- תבנית מייל חדשה בעברית RTL ב-`supabase/functions/_shared/email-templates/expiring-assets.tsx`.
- כפתור "שלח עכשיו ידנית" במסך Alerts (אופציונלי, אדמין בלבד) שמפעיל את אותה פונקציה.

### תזמון cron
שימוש ב-`supabase--insert` (לא migration) ליצירת ה-cron עם ה-`anon key` של הפרויקט הנוכחי, יומי 04:00 UTC ≈ 07:00 ישראל.

## פירוט טכני (DB)

מיגרציות נדרשות:
1. `ALTER TABLE companies ADD COLUMN expiry_notification_emails text;`
2. `ALTER TABLE asset_categories ADD COLUMN default_notification_days_before integer;`
3. `ALTER TABLE assets ADD COLUMN notification_days_before integer;`
4. יצירת טבלת `expiry_notifications_sent` + RLS (super_admin/admin/operations של החברה רואים, service_role בלבד כותב).
5. עדכון `get_company_routing_emails` להחזיר גם את `expiry_notification_emails`.
6. הפעלת extensions `pg_cron` ו-`pg_net` (אם לא פעילות).

## מה לא נעשה

- לא מוחקים נתונים קיימים בעמודת `assets.expiry_date`.
- לא משנים את `get_expiring_assets` — היא כבר מספקת את הנתון הנדרש.
- לא נוגעים בהתראות אחרות במערכת.
