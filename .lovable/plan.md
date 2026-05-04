## הבעיה

בדיאלוג חתימה על טופס קבלת ציוד, ה-iframe נטען, אבל הדפדפן מציג אייקון של "מסמך שבור" במקום ה-PDF. ב-session replay רואים שה-iframe אכן נטען עם `previewUrl`, אז ה-blob נוצר — אבל הוא **פגום**.

## שורש הבעיה

ב-`src/lib/pdf/hebrewPdf.ts` שומרים בקאש את בייטי הגופן כ-`ArrayBuffer` ומעבירים אותם ישירות ל-`pdf.embedFont(cachedRegular, { subset: true })`:

```ts
let cachedRegular: ArrayBuffer | null = null;
...
const regular = await pdf.embedFont(cachedRegular!, { subset: true });
```

`pdf-lib` + `fontkit` עלולים לבצע operations שמנתקים/מבזבזים (detach) את ה-`ArrayBuffer`. בקריאה הראשונה ה-PDF נבנה בסדר, אבל בכל קריאה הבאה (וב-effect הזה הוא רץ מחדש בכל שינוי שדה/חתימה!) ה-cached buffer כבר ריק → font embedding נכשל בשקט → ה-PDF שמתקבל פגום, והדפדפן מסרב להציגו.

זו גם הסיבה שאין שגיאה בקונסולה — pdf-lib לא זורק, רק יוצר PDF לא תקין.

## התיקון

ב-`src/lib/pdf/hebrewPdf.ts`:

1. לשמור את הקאש כ-`Uint8Array` (ולא `ArrayBuffer`).
2. להעביר עותק חדש (`new Uint8Array(cached)`) ל-`pdf.embedFont` בכל קריאה, כדי ש-pdf-lib/fontkit יקבלו תמיד buffer "טרי".
3. אותו טיפול לטעינת התבנית (`loadTemplateBytes` כבר עושה `.slice(0)` אבל נוודא שזה תקין גם תחת קריאות מקבילות).

```ts
let cachedRegular: Uint8Array | null = null;
let cachedBold: Uint8Array | null = null;

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  // magic-header validation as today
  return buf;
}

async function embedHebrewFonts(pdf) {
  pdf.registerFontkit(fontkit);
  if (!cachedRegular) cachedRegular = await loadFontBytes(regularUrl);
  if (!cachedBold)    cachedBold    = await loadFontBytes(boldUrl);
  // Pass a *copy* every time so pdf-lib/fontkit can't mutate our cache
  const regular = await pdf.embedFont(new Uint8Array(cachedRegular), { subset: true });
  const bold    = await pdf.embedFont(new Uint8Array(cachedBold),    { subset: true });
  return { regular, bold };
}
```

4. שיפור קטן ל-debug: להוסיף `console.error` עם פרטים בתוך ה-`catch` של ה-effect ב-`AssignAssetWithFormDialog` ו-`PendingHandoverForms`, כך שאם משהו עדיין נכשל בעתיד נראה את הסיבה מיד.

## הקבצים שמושפעים

- `src/lib/pdf/hebrewPdf.ts` — תיקון מנגנון הקאש של הגופנים.

## בדיקה

לאחר התיקון: לפתוח את דיאלוג החתימה, לוודא שה-PDF מוצג בפעם הראשונה, לסגור ולפתוח שוב, ולשנות שדה (חתימה / משיכה) — בכל פעם ה-PDF צריך להציג כראוי במקום אייקון מסמך שבור.
