
## וידוא קנבס חתימה זהה לטופס מסירת ציוד

יש כבר רכיב חתימה מובנה בפרויקט: **`src/components/SignaturePad.tsx`** — מבוסס `react-signature-canvas`, עם כפתור "נקה", התאמה רספונסיבית (ResizeObserver) ו-API נקי (`getDataUrl`, `clear`, `isEmpty`). הוא הרכיב שבו משתמש `SignHandover.tsx` (טופס מסירת ציוד).

### מה משתנה בתכנית הקודמת
זה לא שינוי מהותי — אלא **התחייבות מפורשת** שהמסך החדש `src/pages/SignOffboarding.tsx` ישתמש **באותו הרכיב בדיוק** (`SignaturePad`) ולא ייצור קנבס חדש משלו.

### פירוט השימוש ב-`SignOffboarding.tsx`

```tsx
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";

const sigRef = useRef<SignaturePadHandle>(null);

// בתוך ה-JSX, מתחת לטבלת הציוד וההצהרה:
<SignaturePad ref={sigRef} label="חתימת העובד" height={180} />

// בעת לחיצה על "אשר וחתום":
const dataUrl = sigRef.current?.getDataUrl();
if (!dataUrl) {
  toast({ title: "חסרה חתימה", description: "יש לחתום לפני שליחה", variant: "destructive" });
  return;
}
// dataUrl נשמר ב-offboarding_forms.signature_data
// ואז ה-OffboardingFormView מוצג עם תמונת החתימה ומועבר ל-generateAndUploadOffboardingPdf
```

### תזכורת לזרימה המלאה (ללא שינוי)

1. העובד פותח את הקישור → רואה את `OffboardingFormView` עם **רק הציוד שב-snapshot** של הטופס הזה.
2. מתחת לטבלה — רכיב `SignaturePad` (זהה לחלוטין לזה שבמסירת ציוד).
3. אופציונלי: שדה צירוף מסמך (input file → upload ל-Storage).
4. כפתור "אשר וחתום" → ולידציה `!sigRef.current?.isEmpty()` → שמירת `signature_data` ב-DB → רינדור ה-View עם החתימה המוטבעת → `generateAndUploadOffboardingPdf` → עדכון `status='signed'`, `pdf_url`, `signed_at`.

### גם בצד המנהל
ב-`OffboardingFormView` (תצוגת ה-PDF/תצוגה מקדימה), אזור החתימה ירונדר באותה מתכונת של `HandoverFormView`: מסגרת מקווקוות עם תמונת ה-`signature_data` (אם קיימת), אחרת קו ריק לחתימה ידנית בהדפסה — בדיוק כמו במסירת ציוד.

### אין שינויים נדרשים ב-`SignaturePad.tsx`
הרכיב הקיים מספק את כל מה שצריך. לא ניצור variant חדש, לא נשכפל לוגיקת קנבס.

### עדכון לרשימת הקבצים בתכנית
ללא תוספת קבצים. רק התחייבות מפורשת בקוד `SignOffboarding.tsx` ו-`OffboardingFormView.tsx` להשתמש ב-`@/components/SignaturePad` הקיים.
