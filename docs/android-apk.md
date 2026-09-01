# בניית APK לאנדרואיד (TWA)

האפליקציה נארזת כ-**Trusted Web Activity** — מעטפת אנדרואיד דקה שמריצה את
`https://tiful360.com` תחת המקור האמיתי שלו. לכן ההתחברות עם גוגל, איפוס סיסמה
וקישורי ההזמנה במייל ממשיכים לעבוד ללא שינוי קוד, בניגוד ל-Capacitor שטוען
מ-`capacitor://localhost` ושובר כל redirect שמבוסס על `window.location.origin`.

## מה כבר מוכן בריפו

| רכיב | מצב |
|---|---|
| `public/manifest.webmanifest` | `start_url` מנתב דרך `/select-experience` לפי תפקיד; `scope: "/"` מכסה את כל המסכים; אין נעילת פורטרט |
| Service worker | `vite-plugin-pwa` ב-`vite.config.ts`. מטמון רק לנכסים סטטיים ולגופני Google — **שום תשובה מ-Supabase לא נשמרת במכשיר** |
| `public/.well-known/assetlinks.json` | קיים עם טביעה זמנית שיש להחליף (ראה שלב 2) |
| אייקונים | `icon-192.png`, `icon-512.png` כולל maskable |

## סדר הפעולות — הסדר חשוב

ה-APK הוא **השלב האחרון**. הוא נבנה מהמניפסט החי שב-`tiful360.com`, ולכן חייבים
לפרוס את האתר לפני שבונים אותו.

### שלב 0 — לפרוס את האתר

לפרוס את הענף. ודא שהמניפסט המעודכן באוויר:

```bash
curl -s https://tiful360.com/manifest.webmanifest
```

### שלב 1 — ליצור מפתח חתימה

```bash
keytool -genkeypair -v -keystore android.keystore -alias tiful360 -keyalg RSA -keysize 2048 -validity 10000
```

> **גבה את `android.keystore` ואת הסיסמאות במקום קבוע ומאובטח.**
> אובדן המפתח משמעו שלא ניתן להוציא עדכון לאפליקציה לעולם — צריך לפרסם אפליקציה
> חדשה ולבקש מכל העובדים להתקין מחדש. אל תשאיר אותו רק על מחשב אחד.

### שלב 2 — לפרסם את טביעת האצבע

```bash
keytool -list -v -keystore android.keystore -alias tiful360 | findstr SHA256
```

להעתיק את הערך לתוך `public/.well-known/assetlinks.json` במקום
`REPLACE_WITH_SHA256_FINGERPRINT_FROM_KEYSTORE`, ולפרוס שוב. לוודא שחוזר JSON:

```bash
curl -s https://tiful360.com/.well-known/assetlinks.json
```

אם חוזר HTML — הקובץ לא נפרס והאפליקציה תציג שורת כתובת של Chrome מעליה.
(נבדק: Vite מעתיק את `public/.well-known/` ל-`dist` כראוי, וה-rewrite
ב-`vercel.json` לא חוטף אותו כי Vercel בודק קבצים סטטיים קודם.)

אם תעלה ל-Google Play עם App Signing — קח את הטביעה מ-Play Console, לא
מה-keystore המקומי. Play מחתים מחדש עם מפתח משלו.

### שלב 3 — לבנות

```bash
npm install -g @bubblewrap/cli
```

```bash
bubblewrap init --manifest https://tiful360.com/manifest.webmanifest
```

בהרצה הראשונה Bubblewrap מציע להתקין JDK 17 ו-Android SDK (כ-1GB) ומבקש
לאשר את רישיונות ה-SDK של גוגל. תשובות למסכי ה-init:

- **Domain**: `tiful360.com`
- **Application ID**: `com.tiful360.app` — חייב להיות זהה ל-`package_name` ב-`assetlinks.json`
- **Signing key**: לבחור בקובץ מהשלב הראשון, alias `tiful360`
- שאר השדות נקראים מהמניפסט

```bash
bubblewrap build
```

התוצרים: `app-release-signed.apk` להפצה ישירה, ו-`app-release-bundle.aab`
ל-Google Play.

### שלב 4 — לוודא

להתקין על מכשיר ולבדוק שאין שורת כתובת של Chrome מעל האפליקציה. אם יש —
ה-`assetlinks.json` לא תואם: בדוק שהטביעה נכונה ושה-`package_name` זהה.

## עדכונים

התוכן מתעדכן לבד — זה אתר. אין צורך ב-APK חדש כשמשנים מסך, מוסיפים שדה או
מתקנים באג. APK חדש נדרש רק לשינוי שם, אייקון, `package_name` או גרסת ה-TWA
עצמה. זו הסיבה המרכזית להעדיף TWA על Capacitor בארגון בלי צוות מובייל.

## מגבלה שכדאי להכיר

TWA מריץ Chrome, ולכן אי אפשר להפעיל `FLAG_SECURE` כדי לחסום צילומי מסך.
באפליקציה שמציגה תלושי שכר ומספרי ת"ז זו החלטה מודעת שצריך לקבל. אם חסימת
צילומי מסך היא דרישה — זה השיקול היחיד כאן שמצדיק מעבר ל-Capacitor, על כל
עבודת ההתחברות שהוא גורר.
