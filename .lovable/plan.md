## מטרה
להשתמש באותה גישת template-PDF (כמו שהוצעה לטופס מסירת ציוד) גם בטופס **החזרת ציוד**, כדי לפתור בעיות פונט עברי, רווחים, והצגת לוגו.

## שינויים

### 1. תבניות PDF
- `public/templates/handover-template.pdf` — תבנית מסירת ציוד (קיים מהמשימה הקודמת).
- `public/templates/offboarding-template.pdf` — תבנית חדשה להחזרת ציוד (מבוססת על אותו עיצוב, עם כותרת "טופס החזרת ציוד" ועמודה נוספת "מצב בעת ההחזרה").

### 2. ספרייה משותפת — `src/lib/pdfTemplate/`
- `loadHebrewFont.ts` — טעינה והטמעה של `NotoSansHebrew` עם `@pdf-lib/fontkit`.
- `drawRtlText.ts` — עזר לציור טקסט עברי מימין-לשמאל בקואורדינטות נתונות.
- `embedSignaturePng.ts` — הטמעת חתימה (data URL) כתמונה.
- `embedLogo.ts` — שליפת לוגו (URL) והטמעתו ב־PDF (תומך CORS דרך fetch).

### 3. מילוי תבניות
- `src/lib/fillHandoverPdfTemplate.ts` — קיים (טופס מסירה).
- `src/lib/fillOffboardingPdfTemplate.ts` — **חדש**:
  - מקבל `OffboardingFormData`.
  - טוען את `offboarding-template.pdf`.
  - ממלא: שם חברה/לוגו, תאריך, שם עובד, ת״ז, מחלקה, תפקיד, תאריך סיום.
  - מצייר טבלת ציוד דינמית (תיאור, יצרן/דגם, מס׳ סידורי, מצב בעת החזרה, הערות) — תמיכה במספר שורות + page break אוטומטי כשעוברים שורה X.
  - חתימת המחזיר וחתימת מקבל הציוד.

### 4. החלפת ה־engine ב־flow ההחזרה
- `src/lib/generateOffboardingPdf.ts` — מתחלף לקבלת `OffboardingFormData` (במקום `HTMLElement`). מחזיר `Blob` או מעלה לפי הצורך.
- `src/pages/SignOffboarding.tsx`:
  - מסיר את ה־`OffboardingFormView` המוסתר וה־`renderHandoverPdfBlob`.
  - בלחיצה על "אישור וחתימה" → קורא ל־`fillOffboardingPdfTemplate({ ...record.form_snapshot, receiver_signature: sig })` → מעלה דרך `uploadViaSignedToken`.
  - התצוגה למשתמש (preview) נשארת עם `OffboardingFormView` הקיים — רק ה־PDF הסופי משתנה.
- `src/components/OffboardingFormsManager.tsx`: ללא שינוי לוגי (מצוקה), אך אם יש כפתור "הורד PDF לפני חתימה" — יקרא לפונקציה החדשה.

### 5. Dependencies
- `pdf-lib`, `@pdf-lib/fontkit` — כבר יותקנו עבור טופס המסירה; משתמשים מחדש.

## קבצים
- חדש: `public/templates/offboarding-template.pdf`
- חדש: `src/lib/fillOffboardingPdfTemplate.ts`
- ערוך: `src/lib/generateOffboardingPdf.ts`
- ערוך: `src/pages/SignOffboarding.tsx`
- שיתוף: `src/lib/pdfTemplate/*` (יווצר במשימה של טופס המסירה ומשמש כאן)

## תוצאה
PDF וקטורי איכותי, עברית תקינה עם רווחים נכונים, לוגו חברה מוצג כראוי, וטבלת ציוד דינמית התומכת בכמות פריטים משתנה — לטופס החזרת הציוד.

האם לאשר ולהמשיך?
