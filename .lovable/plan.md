
## תכנית סופית: שיוך ציוד עם טופס חתימה דיגיטלי

### החלטות שאושרו
1. **יצרן ומודל** → הוסף שדה `manufacturer_model` ל-`assets`
2. **מצב הציוד** → הוסף שדה `condition` ל-`assets` (חדש/תקין/בינוני)
3. **פרטי חברה בפוטר** → להשמיט (לא מוסיפים address/phone/email)
4. **מס׳ סידורי בטופס** → ימשך אוטומטית מ-`assets.asset_code` (המזהה), לא מ-`serial_number`

### שינויי בסיס נתונים

```sql
ALTER TABLE assets
  ADD COLUMN manufacturer_model text,
  ADD COLUMN condition text NOT NULL DEFAULT 'good';  -- 'new' | 'good' | 'fair'

CREATE TABLE asset_handover_forms (
  id uuid PK, company_id, asset_id, employee_id,
  delivery_method text,           -- 'portal' | 'manager_present'
  status text DEFAULT 'pending',  -- 'pending' | 'signed' | 'cancelled'
  sign_token text UNIQUE,
  form_snapshot jsonb,            -- שם, מחלקה, פרטי ציוד, תאריך
  signature_data text,            -- Base64 PNG
  attached_document_url text,
  signed_at, created_at, created_by
);
-- RLS: admin/it_manager של החברה + עובד עם linked_user_id רואה/מעדכן את שלו
```

**Bucket חדש** `handover-forms` (private) — מסמכים מצורפים + PDF סופי.

### שינויי UI במסך נכסים

- **לחיצה על שורה** → פתיחת `EditAssetDialog`
- **עמודת פעולות (שמאל):**
  - אייקון `FileSignature` — שיוך לעובד עם טופס חתימה
  - אייקון `Trash2` — מחיקה (עם `AlertDialog`)
  - שני האייקונים עם `e.stopPropagation()`

### דיאלוג שיוך + מסלולי חתימה

`AssignAssetWithFormDialog`:
1. בחירת עובד (`SearchableSelect`) — הוא גם החותם
2. בחירת מסלול:
   - **(א) שליחה לאזור האישי** — נשמר עם `delivery_method='portal'`, אימייל לעובד, מופיע בפורטל לחתימה
   - **(ב) חתימה מול מנהל תפעול** — נפתח מסך מלא עם הטופס + קנבס חתימה במקום
3. אופציה להעלאת מסמך מצורף חתום בכל מסלול

### הטופס (`HandoverFormView`)

מבנה זהה לטמפלייט שהועלה:
- **כותרת:** לוגו (`companies.logo_url`) משמאל · "בס״ד" מימין · תאריך
- **כותרת מרכזית:** "הצהרת קבלת ציוד"
- **פרטי המקבל:** שם מלא · מחלקה · תאריך משיכה
- **טבלה:** תיאור הפריט · יצרן ומודל · מס׳ סידורי (=`asset_code`) · מצב הציוד
- **4 סעיפי ההצהרה** (טקסט מדויק מהטמפלייט)
- **תחתית:** חתימת הגורם המנפק + חתימת המושך
- ❌ **בלי פוטר חברה**

### שמירה לתיק העובד

לאחר חתימה — יצירת PDF (jsPDF + html2canvas) ב-RTL והעלאה ל-`handover-forms/<company>/<employee>/<asset>.pdf`. הקובץ יוצג ב-`EmployeeDetail` תחת לשונית "ציוד וטפסים" עם הורדה.

### דף חתימה ציבורי

`/handover/:token` — לא דורש התחברות, מציג את ה-snapshot + קנבס חתימה + אופציית העלאת מסמך, מעדכן סטטוס ל-`signed`.

### קבצים

**חדשים:**
- `src/components/AssignAssetWithFormDialog.tsx`
- `src/components/HandoverFormView.tsx` (תצוגה/חתימה/יצוא)
- `src/components/SignaturePad.tsx`
- `src/components/EditAssetDialog.tsx`
- `src/pages/SignHandover.tsx` + ניתוב ב-`App.tsx`
- `src/lib/generateHandoverPdf.ts`
- מיגרציה (טבלה + bucket + RLS)

**יעודכנו:**
- `src/pages/Assets.tsx` — onClick + עמודת אייקונים + מחיקה
- `src/components/AddAssetDialog.tsx` — הוספת `manufacturer_model`, `condition`, `current_owner_id`
- `src/pages/EmployeePortal.tsx` — מקטע "טפסי ציוד לחתימה"
- `src/pages/EmployeeDetail.tsx` — לשונית טפסים חתומים
- `src/hooks/useMutations.ts` — מוטציות `updateAsset`, `deleteAsset`, `createHandoverForm`, `signHandover`

### תלויות חדשות
`react-signature-canvas`, `jspdf`, `html2canvas`
