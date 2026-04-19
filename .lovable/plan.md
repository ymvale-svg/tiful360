
המשתמש רוצה להפוך את תיק העובד (`EmployeeDetail.tsx`) מתצוגה קריאה-בלבד לתיק פעיל שניתן לערוך ולנהל ממנו את כל המידע.

## מה ייבנה

### טאב 1: פרטים אישיים — מצב עריכה
- כפתור "ערוך" בראש הטאב → הופך שדות לטופס (שם מלא, ת.ז, קוד עובד, מחלקה, תפקיד, טלפון, אימייל, תאריך לידה, תאריך תחילת עבודה, סטטוס).
- כפתורי "שמור" / "בטל". שמירה דרך `supabase.from("employees").update()`.

### טאב 2: ציוד משויך — שיוך ישיר
- כפתור "שייך ציוד חדש" → פותח את `AssignAssetWithFormDialog` הקיים, עם העובד הנוכחי כבר מסומן.
- בוחר מתוך פריטים שאינם משויכים (`status = 'in_stock'`).
- ממשיך באותם 3 מסלולי החתימה (פורטל / מול מנהל / קובץ חתום).
- כפתור "בטל שיוך" לכל פריט קיים.

### טאב 3: גישות דיגיטליות — CRUD מלא
- כפתור "הוסף גישה" → דיאלוג חדש (`AddDigitalAccessDialog`) עם שדות: סוג גישה, נתיב/כתובת, רמת הרשאה, סטטוס, הערות.
- כפתורי עריכה/מחיקה לכל שורה קיימת.
- כתיבה לטבלת `digital_access` עם `employee_id` + `company_id`.

### טאב 4: טפסים חתומים — העלאה ידנית
- כפתור "העלה טופס חתום" → דיאלוג קצר: בחירת פריט ציוד + העלאת קובץ ל-bucket `handover-forms`.
- יוצר רשומה ב-`asset_handover_forms` עם `status='signed'`, `delivery_method='manual_upload'`, `attached_document_url`, `signed_at=now()`.
- כפתור צפייה/הורדה לכל טופס קיים (כבר קיים).

## קבצים שייערכו / ייווצרו

| קובץ | פעולה |
|---|---|
| `src/pages/EmployeeDetail.tsx` | הוספת מצב עריכה לטאב פרטים, כפתורי פעולה בכל טאב |
| `src/components/EditEmployeeDialog.tsx` | **חדש** — דיאלוג עריכת פרטי עובד (או inline בעמוד) |
| `src/components/AddDigitalAccessDialog.tsx` | **חדש** — הוספה/עריכת גישה דיגיטלית |
| `src/components/UploadSignedFormDialog.tsx` | **חדש** — העלאת טופס חתום ידנית לעובד |
| `src/hooks/useMutations.ts` | הוספת `useUpdateEmployee`, `useUpsertDigitalAccess`, `useDeleteDigitalAccess` |

## הערות טכניות
- כל הפעולות עוברות דרך RLS הקיים (admin / it_manager בחברה).
- שיוך ציוד מטאב הציוד משתמש מחדש ב-`AssignAssetWithFormDialog` הקיים — בלי כפילות לוגיקה.
- העלאת טפסים חתומים נשענת על ה-bucket הקיים `handover-forms`.
- אין שינויי סכימה — כל הטבלאות הדרושות קיימות.
