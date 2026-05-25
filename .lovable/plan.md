## תוכנית מעודכנת — Stage 5: פרוטוקולים פר חברה + פר קטגוריה + ייצוא

### 1. מסד נתונים
מיגרציה ל-`document_protocols`:
- הוספת `category_id uuid nullable` (FK ל-`asset_categories`).
- אינדקס ייחודי `UNIQUE (company_id, protocol_type, category_id)` עם `NULLS NOT DISTINCT`.
- עדכון RLS: admin/operations של החברה יכולים CRUD על השורות של החברה שלהם; כולם קוראים globals (company_id IS NULL).

### 2. סדר עדיפויות בשליפת תבנית
בזמן חתימה, `useProtocolTemplate(protocolType, categoryId, companyId)` מחזיר את התבנית הספציפית ביותר:
1. `company_id = X AND category_id = Y` (הכי ספציפי)
2. `company_id = X AND category_id IS NULL` (ברירת מחדל פר חברה)
3. `company_id IS NULL AND category_id IS NULL` (ברירת מחדל גלובלית — fallback)

### 3. עורך התבניות — `ProtocolTemplatesTab.tsx`
מסך בהגדרות עם שתי רמות:
- **טאב "ברירות מחדל לחברה"** — 6 סוגי פרוטוקולים, עורך body_template + `requires_issuer_sig` + `validity_days`.
- **טאב "פרוטוקולים פר קטגוריה"** — בחירת קטגוריה → פתיחת override שלה (פרוטוקולים: physical / virtual / vehicle / training / return_physical / return_virtual; הסוג נגזר אוטומטית מהקטגוריה).
- כפתור "שחזר ברירת מחדל" → מוחק את ה-override.
- כפתור **"תצוגה מקדימה כ-PDF"** → מרנדר preview PDF עם נתוני דמה (placeholders ממולאים בערכים לדוגמה) + לוגו החברה הקיים.

Placeholders נתמכים: `{{employee_name}}`, `{{employee_id}}`, `{{asset_name}}`, `{{asset_code}}`, `{{serial}}`, `{{category}}`, `{{date}}`, `{{company_name}}`.

### 4. עדכון `buildHandoverPdf`
- מקבל אופציונלית `logoUrl` (מ-`companies.logo_url`).
- טוען את הלוגו (fetch→base64) ומציב בכותרת ה-PDF.
- מקבל `rendered_body` (מ-form_snapshot) כטקסט פרוטוקול שכבר עבר substitution.

### 5. ProtocolSigningDialog
- שליפת תבנית לפי 3 רמות (hook).
- substitution של placeholders.
- הצגת הטקסט הסופי לעובד לפני חתימה.
- שמירת `rendered_body` ב-`form_snapshot` (כדי שעריכה עתידית של התבנית לא תשנה פרוטוקולים חתומים).

### 6. ייצוא PDF בודד
ב-`HandoverFormsList` — כפתור "הורד PDF" בכל שורה. אם `pdf_url` קיים (קישור ל-`signed_documents`/`asset_handover_forms`) → הורדה ישירה. אם לא קיים עדיין (legacy) → בנייה on-the-fly מה-snapshot.

### 7. קבצים שייווצרו/יעודכנו
- migration: `document_protocols` — `category_id` + index + RLS חדש.
- `src/hooks/useProtocolTemplates.ts` — שליפה היררכית + upsert + reset.
- `src/components/settings/ProtocolTemplatesTab.tsx` — עורך עם שני טאבים + preview.
- `src/lib/buildHandoverPdf.ts` — תמיכה ב-logoUrl + rendered_body.
- `src/components/protocols/ProtocolSigningDialog.tsx` — שימוש בתבנית דינמית.
- `src/components/assets/HandoverFormsList.tsx` — כפתור הורדה.
- הוספת טאב חדש בעמוד Settings.

### הערה
ללא היסטוריית גרסאות (עריכה דורסת). שמירת `rendered_body` ב-snapshot מבטיחה שהטקסט שנחתם נשמר נצח.
