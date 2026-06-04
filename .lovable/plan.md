## שינויים מבוקשים

### 1. תצוגת תאריך בכרטיס ימי הולדת (EmployeePortal)

- עובד "לועזי": מוצג רק התאריך הלועזי (לדוג׳ "4 ביוני"). אם היום/מחר → "🎉 היום!" / "מחר" במקום התאריך.
- עובד "עברי": מוצג רק התאריך העברי בגימטריה (לדוג׳ "ט"ו ניסן"). אם היום/מחר → "🎉 היום!" / "מחר" במקום התאריך.
- כלומר ה-`label` הקיים נכון, רק נוודא שאין מיזוג של שני הפורמטים.

### 2. קלט שנה עברית בגימטריה בלבד (BirthdayPreferenceCard + EditEmployeeDialog)

- שדה השנה יהיה טקסט (לא מספר), בו העובד יקליד בעברית בלבד (לדוג׳ "תשמ"ה" או "תשפ"ד").
- ב-`hebrewBirthday.ts` נוסיף `parseHebrewYearGematriya(text): number | null` שממירה אותיות גימטריה לערך מספרי (מוסיפה 5000 כשמושמט אלף, מתעלמת מ-"/׳/״).
- בזמן הקלדה: ניסיון פירוק; אם תקין → התצוגה המקדימה (`formatHebrewBirthGematriya`) מוצגת. אם לא → הודעת ולידציה.
- בשמירה לטבלה עדיין נשמור את הערך כמספר (`hebrew_birth_year smallint`) — ההמרה היא רק UI, ללא הצגת המספר למשתמש.
- חודש "אדר" בשנה מעוברת יוצג אוטומטית כ-"אדר א'" / "אדר ב'" ברשימת הבחירה (לפי תוצאת `parseHebrewYearGematriya`); בשנה פשוטה תופיע רק "אדר".

### 3. רכיב תאריך ושעה בבאנר "ברוכים הבאים"

- רכיב חדש `src/components/portal/WelcomeDateTime.tsx` בצד שמאל של הבאנר.
- סדר השורות (מלמעלה למטה):
  1. שעה נוכחית — `HH:MM` (מתעדכן כל דקה).
  2. יום בשבוע — לדוג׳ "יום חמישי".
  3. תאריך לועזי — לדוג׳ "4 ביוני 2026".
  4. תאריך עברי — גימטריה מלאה לדוג׳ "כ״ב סיון תשפ״ו" (באמצעות `new HDate(new Date()).renderGematriya()` + `stripNikud`).
- במובייל יורד מתחת לברכה; בדסקטופ — `justify-between` בצד שמאל של הבאנר.

## פירוט טכני

קבצים שיתעדכנו:

- `src/lib/hebrewBirthday.ts` — `parseHebrewYearGematriya`, `getHebrewMonthsForYear(hyear)` להחזרת תוויות אדר דינמיות, `formatTodayHebrewGematriya()`.
- `src/components/portal/BirthdayPreferenceCard.tsx` — שדה שנה טקסטואלי בעברית, רשימת חודשים דינמית, תצוגה מקדימה.
- `src/components/EditEmployeeDialog.tsx` — אותו עדכון לשדה השנה והחודשים.
- `src/components/portal/WelcomeDateTime.tsx` — חדש.
- `src/pages/EmployeePortal.tsx` — שילוב `WelcomeDateTime` בבאנר; הצגת `label` בלבד בכרטיס ימי ההולדת (ללא הוספת לועזי לעבריים או להיפך).

ללא שינויי DB.