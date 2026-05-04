## מיפוי הטפסים

| סטטוס | שם הטופס | טמפלייט | מנוע |
|---|---|---|---|
| **משיכת ציוד** | טופס משיכת ציוד | `public/templates/receive-template.pdf` | `buildHandoverPdf.ts` |
| **זיכוי ציוד** | טופס זיכוי ציוד | `public/templates/return-template.pdf` | `buildOffboardingPdf.ts` |

## הבדלים בין הטפסים

**משותף:** לוגו אשל הירדן בראש, פרטי עובד (שם / מחלקה / תאריך), טבלת ציוד (4 עמודות: תיאור, יצרן ומודל, S/N, מצב), שתי תיבות חתימה, פוטר.

**ייחודי לזיכוי:**
- שדה "מצב הציוד הכללי": תקין / לא תקין / חסר (checkbox)
- שדה "הערות בנוגע למצב הציוד" (טקסט חופשי)
- שמות החתימות: "חתימת נציג מחשוב/מחסן (המקבל)" + "חתימת העובד (המחזיר)"

**ייחודי למשיכה:**
- 4 סעיפי הצהרה והתחייבות
- שמות החתימות: "חתימת המושך" + "אישור גורם מנפק (מחסן/מחשוב)"

## שלבי הביצוע

### 1. הכנת הטמפלייטים
- העלאה: `public/templates/receive-template.pdf` (מהקובץ "טופס משיכת ציוד")
- העלאה: `public/templates/return-template.pdf` (מהקובץ "טופס זיכוי ציוד") — מחליף את הקובץ הקיים `handover-template.pdf`

### 2. הרחבת `src/lib/pdf/hebrewPdf.ts`
תוספת helpers:
- `loadTemplateDoc(url)` — טוען PDF קיים, רושם fontkit, embed פונט עברי, מחזיר `{ pdf, page, regular, bold, width, height }`
- `clonePageFromTemplate(pdf, templateBytes)` — משכפל עמוד נוסף מהטמפלייט (לצורך pagination)

### 3. לוגיקת Pagination (משותפת לשני המנועים)

**קבועים:**
- `ROWS_PER_PAGE = 3` (כמספר השורות הריקות בטמפלייט המקורי)

**אלגוריתם:**
1. חלוקת מערך הציוד לחלקים של 3 פריטים: `chunks = chunk(assets, 3)`
2. אם `chunks.length === 0` → לפחות עמוד אחד עם טבלה ריקה
3. עמוד ראשון: נטען מהטמפלייט המקורי
4. לכל chunk נוסף (החל מהשני): שכפול עמוד מהטמפלייט הוסף ל-pdf
5. לכל עמוד: ציור פרטי עובד (שם/מחלקה/תאריך) + שורות הטבלה של ה-chunk שלו
6. **חתימות, הצהרה, checkbox מצב, הערות** — מצוירים **רק על העמוד האחרון** (מאחר שהטמפלייט מציג אותם בכל עמוד אבל הם רלוונטיים לחתימה הסופית בלבד; בעמודי ביניים נשאיר את אזור החתימה ריק)
7. בכל עמוד: כיתוב "עמוד X מתוך Y" בפינה התחתונה (מעל הפוטר)

### 4. שכתוב מנועי PDF

**`src/lib/pdf/buildHandoverPdf.ts` (משיכה):**
- טעינת `receive-template.pdf`
- pagination לפי `ROWS_PER_PAGE = 3`
- שדות שנכתבים על כל עמוד: שם, מחלקה, תאריך, שורות הטבלה הרלוונטיות
- שדות בעמוד אחרון בלבד: חתימת המושך (תיבה ימנית), חתימת מנפק (תיבה שמאלית)

**`src/lib/pdf/buildOffboardingPdf.ts` (זיכוי):**
- טעינת `return-template.pdf`
- אותה לוגיקת pagination
- שדות בעמוד אחרון בלבד: 
  - סימון checkbox מצב ציוד (תקין/לא תקין/חסר)
  - הערות (עם wrapping ל-2-3 שורות)
  - חתימת נציג (המקבל) — תיבה ימנית
  - חתימת עובד (המחזיר) — תיבה שמאלית

### 5. כיול קואורדינטות (QA ויזואלי חובה לכל טופס)
1. בנייה עם נתוני בדיקה: 2 פריטים (עמוד אחד), 5 פריטים (2 עמודים), 8 פריטים (3 עמודים)
2. `pdftoppm -jpeg -r 150` המרה לתמונות
3. השוואה מול הטמפלייט הריק:
   - כל ערך מתיישר עם תוויות הטמפלייט (ללא חיתוך / חפיפה)
   - שורות הטבלה לא בורחות מהתאים
   - חתימות בתוך התיבות, לא חורגות
   - "עמוד X מתוך Y" קריא ולא מסתיר טקסט
4. כיוונון עד מעבר נקי על כל הסצנריוז

### 6. ניקוי
- מחיקה: `src/components/HandoverFormView.tsx`, `src/components/OffboardingFormView.tsx` (תצוגות HTML מיותרות — התצוגה ב-iframe של ה-PDF)
- יצירה: `src/lib/pdf/types.ts` — interfaces משותפים
- עדכון imports: `SignHandover.tsx`, `SignOffboarding.tsx`, `AssignAssetWithFormDialog.tsx`, `OffboardingFormsManager.tsx`, `OffboardingDialog.tsx`
- הסרת זרימת `company_logo_url` (הלוגו צרוב בטמפלייט)

### 7. אימות E2E
- משיכת ציוד עם 2 פריטים → עמוד אחד מלא + חתימות
- משיכת ציוד עם 7 פריטים → 3 עמודים, חתימות רק באחרון, "עמוד X מתוך 3" בכולם
- זיכוי ציוד עם 4 פריטים → 2 עמודים, checkbox + הערות + חתימות רק באחרון
- חתימה במסך → שמירה → פתיחת ה-PDF הסופי מ-storage → ולידציה

## קבצים

**חדשים:**
- `public/templates/receive-template.pdf`
- `public/templates/return-template.pdf` (מחליף `handover-template.pdf`)
- `src/lib/pdf/types.ts`

**שכתוב מלא:**
- `src/lib/pdf/buildHandoverPdf.ts`
- `src/lib/pdf/buildOffboardingPdf.ts`
- `src/lib/pdf/hebrewPdf.ts` (תוספת `loadTemplateDoc` + `clonePageFromTemplate`)

**עדכון imports / ניקוי `company_logo_url`:**
- `src/pages/SignHandover.tsx`
- `src/pages/SignOffboarding.tsx`
- `src/components/AssignAssetWithFormDialog.tsx`
- `src/components/OffboardingFormsManager.tsx`
- `src/components/OffboardingDialog.tsx`

**מחיקה:**
- `src/components/HandoverFormView.tsx`
- `src/components/OffboardingFormView.tsx`
- `public/templates/handover-template.pdf`