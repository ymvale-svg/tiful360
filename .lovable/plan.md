# סגירת הלולאה — מדריך פריסה מפורט ל-Agent v2.2.0

המטרה: שהמחשב המקומי ישלח "אני בחיים" כל דקה לענן, גם כשאין פאנצ'ים, כדי שמסך הנוכחות בענן יציג סטטוס אמיתי (מחובר / השעון לא נגיש / Agent מנותק).

---

## שלב 1 — לוודא שהקבצים החדשים נמצאים במחשב המקומי

הקבצים שהשתנו בענן:

- `agent/index.js` — נוסף heartbeat
- `agent/package.json` — גרסה 2.2.0

יש שתי דרכים להעביר את הקוד למחשב המקומי:

**אופציה א — Git (אם הפרויקט מסונכרן עם GitHub):**

```cmd
cd C:\path\to\agent
git pull
```

**אופציה ב — העתקה ידנית:**

1. הורד מהענן את שני הקבצים: `agent/index.js` ו-`agent/package.json`
2. החלף אותם בתיקיית ה-agent במחשב (גיבוי תחילה: שכפל את הישנים ל-`*.bak`)

לאמת שהגיע הקוד הנכון:

```cmd
type agent\package.json | findstr version
```

אמור להופיע: `"version": "2.2.0"`

---

## שלב 2 — לוודא ש-`.env` עדכני

לפתוח את `agent\.env` ולוודא שיש את כל אלה:

```
ATTENDANCE_INGEST_TOKEN=<הטוקן מהענן>
SUPABASE_FUNCTIONS_URL=https://rhzmhiknbcipucfvgkok.supabase.co/functions/v1
COMPANY_ID=<id החברה>
CLOCK_HOST=10.0.0.114
CLOCK_PORT=4370
```

אם משהו חסר — `npm run setup` יבנה את זה אינטראקטיבית.

---

## שלב 3 — בדיקה ידנית חד-פעמית (לפני הפעלת ה-Service)

פתח cmd רגיל בתיקיית ה-agent והרץ:

```cmd
cd C:\path\to\agent
node index.js --once
```

מה אמור להופיע בלוג:

1. שורה ראשונה: `=== ZKTeco Attendance Agent ===`
2. בהמשך: `💓 heartbeat נשלח | clock_reachable=true` (או `false` אם השעון כבוי)
3. ניסיון התחברות לשעון ושליפת רשומות

אם רואים את `💓 heartbeat נשלח` — הקוד החדש פעיל ✓

---

## שלב 4 — אימות בענן שהגיע ה-heartbeat

חזור לאפליקציה בענן → `/payroll?tab=attendance` → אמור להופיע אינדיקטור ירוק "מחובר" (Wifi).

אם רוצים לאמת בצורה ישירה, אריץ עבורך כאן (אחרי השלב הזה) שאילתה:

```sql
type agent\package.json | findstr version
```

---

## שלב 5 — הפעלת ה-Service מחדש (לפעולה רציפה ברקע)

**אם ה-Service כבר מותקן:**

פתח **cmd כ-Administrator** והרץ:

```cmd
sc stop  "tiful360attendanceagent"
sc start "tiful360attendanceagent"
```

או דרך GUI: `services.msc` → חפש "Tiful360 Attendance Agent" → Restart.

**אם לא מותקן עדיין:**

```cmd
cd C:\path\to\agent
npm install
npm run service:install
```

(חובה Administrator)

---

## שלב 6 — לוודא שה-Service פועל ויציב

```cmd
sc stop  "tiful360attendanceagent"

```

ה-`STATE` אמור להיות `RUNNING`.

לוגי ה-Service נמצאים בתיקיית `agent\daemon\` — לפתוח את הקובץ האחרון ולחפש שורות `💓 heartbeat נשלח` שחוזרות כל ~60 שניות.

---

## שלב 7 — הגדרות חיוניות במחשב המקומי כדי למנוע ניתוקים

1. **לוח בקרה → Power Options → "Never Sleep"** למחשב גם כשהמסך כבוי
2. **Network adapter → Properties → Power Management** → לבטל "Allow the computer to turn off this device"
3. **Windows Update** — להגדיר "Active hours" כדי למנוע אתחולים בשעות עבודה
4. **Firewall** — לוודא שיוצאות בקשות ל-`*.supabase.co` (HTTPS 443) ול-`10.0.0.114:4370` (TCP/UDP)
5. ה-Service מוגדר כבר עם `wait: 2, grow: 0.5, maxRestarts: 40` ב-`install-service.js` — Auto-Restart פעיל אם יקרוס.

---

## שלב 8 — אימות סופי בענן (תוך 2 דקות מההפעלה)

במסך `/payroll?tab=attendance`:

- ✅ ירוק "מחובר וממתין" / "זרימה פעילה" — הכל תקין
- 🟡 כתום "השעון לא נגיש" — ה-agent חי אבל השעון 10.0.0.114 לא עונה (לבדוק כבל רשת/חשמל לשעון)
- 🔴 אדום "Agent מנותק" — ה-Service לא רץ או חסום מהאינטרנט

---

## תקלות נפוצות ופתרונן


| תסמין                         | סיבה סבירה                  | פתרון                                                   |
| ----------------------------- | --------------------------- | ------------------------------------------------------- |
| `💓 heartbeat נכשל: HTTP 401` | טוקן שגוי ב-`.env`          | לעדכן `ATTENDANCE_INGEST_TOKEN` ולהפעיל מחדש            |
| `clock_reachable=false`       | השעון כבוי / IP אחר         | ping ל-`10.0.0.114`, לעדכן `CLOCK_HOST`                 |
| ה-Service לא עולה             | חסר `node` ב-PATH של System | להריץ install-service כ-Admin עם node מותקן ל-All Users |
| heartbeat לא מגיע לענן בכלל   | חומת אש חוסמת HTTPS יוצא    | להוסיף חוק יציאה ל-`*.supabase.co:443`                  |


---

## סיכום הזרימה החדשה

```text
[שעון 10.0.0.114] ←TCP 4370← [Agent ב-PC]
                                  │
                                  ├── כל 30 שנ': מושך פאנצ'ים → POST /ingest-attendance-punch
                                  │
                                  └── כל 60 שנ': בודק TCP לשעון → POST /ingest-attendance-heartbeat
                                                                          │
                                                                          ▼
                                                    [attendance_agent_heartbeats]
                                                                          │
                                                                          ▼
                                                            UI במסך נוכחות (זמן אמת)
```

זהו — אחרי שלב 5 הלולאה סגורה, והמסך בענן יראה תמיד את האמת.