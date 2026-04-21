

## תיקון פיצול תלושים — אחסון PDF מקורי + טווחי עמודים

### האבחנה
המסך מציג 0/0/0 כי הפונקציה הנוכחית עדיין מבצעת `pdf-lib` `copyPages` + `save` לכל קבוצה — פעולה עתירת CPU שגורמת ל-`WORKER_RESOURCE_LIMIT` באמצע הלולאה. גם אם `extractText` מצליח, השלב של בניית PDF נפרד לכל עובד מתרסק לפני שמשהו נשמר. בנוסף, אם `extractText` נכשל על המסמך כולו — אף קבוצה לא נוצרת ומחזירים 0/0/0.

לפי הבחירה המאושרת: **לא לפצל את ה-PDF.** לשמור את ה-PDF המקורי פעם אחת, ולשמור לכל עובד טווח עמודים בלבד. הצפייה תרנדר רק את העמודים שלו מתוך הקובץ המקורי.

### שינוי סכימה (`payslips`)
שתי עמודות חדשות:
- `source_pdf_url text` — נתיב לקובץ המקורי המשותף בכל הקבוצה.
- `page_indices integer[]` — אינדקסי העמודים של העובד בתוך הקובץ.
`pdf_url` יישאר אופציונלי לתאימות לאחור.

### שינוי ב-Edge Function `split-payslips`
1. **להעלות את ה-PDF המקורי פעם אחת** ל-`payslips/{company}/{year}-{month}/_source_{batchId}.pdf`.
2. **לחלץ טקסט פעם אחת** (כבר עושים) ולקבץ עמודים לפי ת"ז (כבר עושים).
3. **למחוק את כל ה-block של `PDFDocument.create()`/`copyPages`/`save`/`upload` לכל קבוצה.**
4. לכל קבוצה — רק `INSERT/UPSERT` ל-`payslips` עם `source_pdf_url` + `page_indices` + ערכים מחולצים.
5. להסיר את ה-import של `pdf-lib` לחלוטין (לא נחוץ יותר). לשמור רק את `unpdf` לחילוץ טקסט.

תוצאה: O(1) פעולות PDF במקום O(n) — אפס סיכון ל-CPU limit.

### שינוי בצד הלקוח — צפייה בתלוש בודד
- `getPayslipSignedUrl(path)` ב-`src/hooks/usePayslips.ts` יקבל אופציונלית `pageIndices`. אם יש — מוסיפים ל-URL את ה-fragment `#page={firstPage+1}` (תקן PDF.js/Chrome מציג מהעמוד הזה).
- `EmployeePayslipsTab.tsx` ו-`EmployeePortal` ייקראו ל-helper עם `payslip.source_pdf_url ?? payslip.pdf_url` ועם `payslip.page_indices`.
- **הערה למשתמש**: הצופה יפתח על העמוד הראשון של העובד, אבל המשתמש יוכל לגלול לעמודים סמוכים של עובדים אחרים בקובץ המקורי. זו פשרה הכרחית כדי להימנע מ-CPU limit. אם רוצים בידוד מלא — נדרש שירות חיצוני (iLovePDF) שכרוך ב-API key ועלות.

### `EmployeePayslipsTab` — תצוגה
לעדכן את הקישור כך שיפתח טאב חדש עם ה-fragment `#page=N#toolbar=0`, וישלח ל-PDF viewer של הדפדפן ישירות לעמוד הנכון.

### ניקוי
- `pdf-lib` import מוסר מ-`split-payslips/index.ts`.
- אם יש שורות `payslip.pdf_url` ישנות בלי `source_pdf_url` — הקוד נופל חזרה ל-`pdf_url` (תאימות).

### קבצים מושפעים

| קובץ | שינוי |
|---|---|
| migration חדשה | `ALTER TABLE payslips ADD COLUMN source_pdf_url text, page_indices integer[]` |
| `supabase/functions/split-payslips/index.ts` | להוריד pdf-lib, להעלות source PDF פעם אחת, לשמור page_indices בלבד |
| `src/hooks/usePayslips.ts` | `getPayslipSignedUrl` מקבל `pageIndices?` ומחזיר URL עם `#page=N` |
| `src/components/EmployeePayslipsTab.tsx` | להשתמש ב-`source_pdf_url` + `page_indices` |
| `src/pages/EmployeePortal.tsx` | אותו עדכון בצד העובד |
| `src/integrations/supabase/types.ts` | ייווצר אוטומטית מהמיגרציה |

### בדיקה לאחר ביצוע
1. להעלות PDF מאוחד גדול (10+ עמודים).
2. לוודא שה-batch מסתיים ב-`done` עם `matched > 0`.
3. ללחוץ "צפייה בתלוש" בכרטיס עובד — לוודא ש-PDF נפתח ומציג את העמוד הנכון.
4. לוודא שיתרות חופשה/מחלה התעדכנו.

