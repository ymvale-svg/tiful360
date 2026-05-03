# Attendance Clock Agent — ZKTeco U560

Agent מקומי שמושך פאנצ'ים מהשעון בפרוטוקול ZK ושולח ל-Lovable Cloud.

## למה PULL ולא PUSH?

הקושחה של U560 (`ZMM200_TFT`) **לא** תומכת ב-ADMS/PUSH HTTP. השעון מדבר רק
פרוטוקול ZK בינארי על פורט 4370 (UDP/TCP). לכן ה-Agent יוזם חיבור, שולח
`CMD_CONNECT` → `CMD_ATTLOG_RRQ`, מקבל את ה-buffer, ומתנתק. כל זה עטוף
ב-`node-zklib`.

## התקנה

```bash
cd agent
npm install
cp .env.example .env
# ערוך .env: הדבק את ה-token, ה-COMPANY_ID, ואמת את CLOCK_HOST
```

## בדיקה ראשונה (ללא שליחה)

```bash
npm run raw
```

זה יתחבר לשעון, ידפיס כמה רשומות יש בו וידגום עד 20 אחרונות עם:
- `deviceUserId` — מספר העובד כפי שהוקלד בשעון
- `recordTime` — חותמת זמן
- `state` — סוג הפעולה (0=כניסה, 1=יציאה, 2=הפסקה-יציאה, 3=הפסקה-חזרה, 4/5=שעות נוספות)
- `mappedDirection` — איך ה-Agent ימפה את זה

**העבר פאנץ' אחד עכשיו בשעון** ובדוק שהוא מופיע ב-RAW. אם כן — תעבור להפעלה רגילה.

## הפעלה רגילה

```bash
npm start            # פולינג כל POLL_INTERVAL_MS
# או
npm run once         # מחזור אחד (לשימוש עם cron / Task Scheduler)
```

## איך נמנע מכפילויות?

ה-Agent שומר `state.json` עם מפתחות של רשומות שכבר נשלחו
(`employeeId|timestamp|state`). רשומה חוזרת מהשעון לא תישלח שנית.

`CLEAR_AFTER_SEND=true` ימחק את הלוג מהשעון אחרי שליחה מוצלחת — **אל תפעיל
את זה עד שאתה בטוח שהמערכת יציבה**, כי המחיקה היא לתמיד.

## פתרון בעיות

- **timeout / לא מתחבר**: ודא ש-Port 4370 פתוח (גם UDP). נסה `ping 10.0.0.114`.
- **CLOCK_INPORT תפוס**: שנה ל-5201/5202.
- **getAttendances זורק**: נסה להעלות את `CLOCK_TIMEOUT` ל-10000.
- **direction=unknown**: השעון מחזיר state חריג — שלח לי את הפלט מ-`--raw`.
