

## תיקון שגיאת UPSERT בתלושי שכר — Partial Unique Index

### האבחנה (מה קורה בפועל)

הזיהוי עובד מצוין — 22 מתוך 22 עמודים זוהו עם ת"ז נכונה (`033204439`, `203242904`, `056055486` וכו'), נוצרו 22 קבוצות, נטענו 31 עובדים. אבל **כל 22 הקבוצות נכשלות** בשמירה ל-DB עם:

```
code: "42P10"
message: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
```

**הסיבה**: ה-Edge Function משתמש ב-`upsert(..., { onConflict: 'employee_id,period_year,period_month' })`. בטבלה קיים אינדקס בשם `payslips_employee_period_uniq` שהוא **partial unique index**:

```sql
CREATE UNIQUE INDEX payslips_employee_period_uniq 
ON payslips (employee_id, period_year, period_month) 
WHERE (employee_id IS NOT NULL);
```

PostgreSQL לא מקבל partial unique indexes ב-`ON CONFLICT (cols)` — דורש constraint מלא או ציון מפורש של ה-`WHERE` בפסוקית. PostgREST/supabase-js לא תומך בציון ה-`WHERE`, ולכן ה-upsert נכשל לחלוטין → 22 נכשלים, 0 הותאמו.

### השינוי

**שתי עבודות מקבילות:**

#### 1. מיגרציה ב-DB
ליצור UNIQUE CONSTRAINT אמיתי (לא partial) על `(employee_id, period_year, period_month)`. כדי שזה יעבוד עם רשומות `unmatched` (employee_id=NULL):
- ב-PostgreSQL, NULL נחשב unique תמיד — כלומר ניתן להכניס מספר רשומות עם `employee_id=NULL` בלי בעיה גם תחת UNIQUE constraint רגיל.
- לכן ניתן להוריד את ה-WHERE ולהפוך את האינדקס ל-constraint מלא:

```sql
DROP INDEX IF EXISTS payslips_employee_period_uniq;
ALTER TABLE payslips 
  ADD CONSTRAINT payslips_employee_period_uniq 
  UNIQUE (employee_id, period_year, period_month);
```

זה יוצר constraint שניתן להפניה ב-`onConflict`, ובו זמנית מאפשר רשומות unmatched (NULL) מרובות באותה תקופה.

#### 2. תיקון ב-Edge Function (גיבוי בטיחות)
לעטוף את ה-upsert ב-try/catch שאם `onConflict` נכשל — לבדוק אם רשומה קיימת ולעשות `update` או `insert` ידנית. זה גיבוי במקרה שהמיגרציה תיכשל מסיבה כלשהי.

### קבצים מושפעים

| קובץ | שינוי |
|---|---|
| מיגרציה חדשה | DROP partial index + ADD UNIQUE constraint על `payslips(employee_id, period_year, period_month)` |
| `supabase/functions/split-payslips/index.ts` | (אופציונלי) fallback ידני ל-update/insert במקרה שה-upsert נכשל |

### בדיקה לאחר ביצוע
1. להעלות שוב את אותו PDF (T2091b32.pdf — 22 עמודים).
2. **תוצאה צפויה**: `groups=22`, `matched=N` (כמה ת"ז קיימות בעובדים), `unmatched=22-N`, **`failed=0`**.
3. הכרטיס האדום "נכשלו" אמור להציג 0.
4. לבדוק שיתרות חופשה/מחלה התעדכנו לעובדים שהותאמו.

