
## הסרת קוד מיכפל מהמערכת

הסרה מלאה של ההסתמכות על `michpal_code` — שיוך תלושים יתבצע אך ורק לפי תעודת זהות.

### מסד נתונים (מיגרציה)

```sql
-- הסרת אינדקסים שמשתמשים בעמודות
DROP INDEX IF EXISTS idx_payslips_michpal_code_detected;

-- הסרת העמודות
ALTER TABLE public.employees DROP COLUMN IF EXISTS michpal_code;
ALTER TABLE public.payslips  DROP COLUMN IF EXISTS michpal_code_detected;
```

(תלוי במיגרציה הקודמת שמוסיפה `id_number_detected` — מבוצעת לפניה או באותה מיגרציה.)

### Edge function — `supabase/functions/split-payslips/index.ts`

- הסרת חילוץ `michpalCode` מ-`extractFields`.
- `PageInfo` — הסרת השדה `michpalCode`, נשאר רק `idNumber`.
- קיבוץ עמודים לפי `idNumber` בלבד; עמודי המשך ללא ת.ז. מצורפים לקבוצה הקודמת.
- lookup עובדים: `select('id, full_name, id_number')` בלבד; הסרת `codeMap`.
- שמירה ב-`payslips`: רק `id_number_detected`.
- `unmatched_codes` בתשובה מוחלף ב-`unmatched_id_numbers` בלבד.

### Frontend

| קובץ | שינוי |
|---|---|
| `src/hooks/usePayslips.ts` | הסרת `michpal_code_detected` מה-interface `Payslip`, הוספת `id_number_detected` |
| `src/components/PayslipsUploadDialog.tsx` | הצגת ת.ז. במקום קוד מיכפל ב-summary ובהקצאה ידנית; הודעות "ת.ז. לא מוכר" במקום "קוד מיכפל לא מוכר" |
| `src/components/AddEmployeeDialog.tsx` | הסרת שדה "קוד מיכפל" |
| `src/components/EditEmployeeDialog.tsx` | הסרת שדה "קוד מיכפל" |
| `src/components/ImportExcelDialog.tsx` | הסרת `michpal_code` מתבנית הייבוא, מהוולידציה ומה-INSERT |
| `src/components/EmployeePayslipsTab.tsx` | הסרת הטיפ "ודא שמספר העובד במיכפל מוגדר…" — להחליף ב"ודא שתעודת הזהות מוגדרת בכרטיס העובד" |
| `src/hooks/useMutations.ts` | הסרת `michpal_code` מ-`useCreateEmployee` / update |
| `src/pages/Employees.tsx` | הסרת עמודת "קוד מיכפל" אם מוצגת |
| `src/integrations/supabase/types.ts` | מתעדכן אוטומטית אחרי המיגרציה |

חיפוש גלובלי אחר `michpal_code` / `michpalCode` / "מיכפל" יבוצע כדי לוודא שאין שאריות.

### הערות

- **שינוי הרסני**: כל ערכי `michpal_code` הקיימים יימחקו לצמיתות. אם המשתמש רוצה לשמור היסטוריה — יש לבצע export לפני המיגרציה.
- תלושים שכבר נשמרו ושויכו לעובד (`employee_id` קיים) נשארים משויכים — רק שדה ה-detection נמחק.
- תלושים שהיו unmatched לפי קוד מיכפל בלבד יישארו unmatched אם אין ת.ז. שזוהה.
