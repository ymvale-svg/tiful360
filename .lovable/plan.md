

## תוכנית: Google OAuth עצמאי ללא תלות ב-Lovable

### מה ישתנה

**קובץ: `src/pages/Login.tsx`**
- הסרת ה-import של `lovable` מ-`@/integrations/lovable/index`
- הסרת המשתנה `isLovableHost` והפיצול הלוגי
- שימוש אך ורק ב-`supabase.auth.signInWithOAuth({ provider: "google" })` בכל הסביבות
- הגדרת `redirectTo` ל-`${window.location.origin}/select-company`

### דרישות מקדימות (ידניות, לא בקוד)
1. ב-Google Cloud Console: יצירת OAuth Client ID עם ה-origins וה-redirect URIs הנכונים
2. ב-Lovable Cloud (Cloud → Users → Auth Settings → Google): הזנת ה-Client ID וה-Client Secret

### תוצאה
- התחברות Google תעבוד על כל דומיין (Vercel, tiful360.com, lovable.app)
- ה-credentials שלך, ללא תלות בשירות מנוהל

