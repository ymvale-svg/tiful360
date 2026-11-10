# Tiful360 Attendance Agent (Python)

Agent קליל ב-Python שמושך פאנצ'ים משעון ZKTeco (U560 ודומיו) ושולח ל-Tiful360 Cloud.

## דרישות

- Python 3.11+
- חיבור רשת לשעון (TCP port 4370)
- חיבור אינטרנט

## התקנה — 3 פקודות

```powershell
python -m pip install -r requirements.txt
python setup.py
python main.py
```

`setup.py` הוא אשף אינטראקטיבי — שואל טוקן, בוחר חברה מהענן, IP של השעון. כותב `.env`.

## הסרת ה-Agent הישן (Node) לפני התקנה

```powershell
sc.exe stop  "Tiful360 Attendance Agent"
sc.exe delete "Tiful360 Attendance Agent"
Remove-Item C:\attendance-agent -Recurse -Force -ErrorAction SilentlyContinue
```

## התקנה כ-Windows Service

```powershell
# cmd as Administrator
python service_windows.py install
python service_windows.py start
```

הסרה:
```powershell
python service_windows.py stop
python service_windows.py remove
```

לוגים: `logs/agent.log`.

## משתני סביבה (`.env`)

| משתנה | תיאור |
| --- | --- |
| `INGEST_URL` | בסיס ה-edge functions |
| `INGEST_TOKEN` | `ATTENDANCE_INGEST_TOKEN` מהענן |
| `COMPANY_ID` | UUID של החברה |
| `CLOCK_IP` | IP של השעון |
| `CLOCK_PORT` | ברירת מחדל 4370 |
| `EMPLOYEE_CODE_PREFIX` | קידומת אופציונלית לקוד עובד |
| `MIN_PUNCH_DATE` | תאריך/שעה להתחלת backfill, למשל `2026-06-07T00:00:00+03:00` |
| `POLL_INTERVAL` | שניות בין סיבובי polling fallback (30) |
| `HEARTBEAT_INTERVAL` | שניות בין heartbeats (60) |

## איך זה עובד

1. **Live capture** — `pyzk.live_capture()` דוחף פאנצ'ים בזמן אמת.
2. **Polling fallback** — אם live נופל, סיבוב `get_attendance` כל `POLL_INTERVAL` שניות.
3. **State** — `state.json` שומר `last_punch_at` למניעת כפילויות.
4. **Heartbeat** — שליחה ל-`ingest-attendance-heartbeat` כל דקה עם גרסה, IP, סטטוס.
5. **בלי updater אוטומטי** — עדכון = `git pull && python setup.py`.

## פתרון תקלות

- שעון לא נגיש → `ping <CLOCK_IP>` ו-`Test-NetConnection <CLOCK_IP> -Port 4370`.
- 401 מה-ingest → טוקן שגוי, הרץ `python setup.py` שוב.
- חסרים פאנצ'ים מתאריך מסוים → עצור את הסוכן, עדכן `.env` עם `MIN_PUNCH_DATE=2026-06-07T00:00:00+03:00`, הפעל שוב `python main.py`. הסוכן יחזיר את `state.json` אחורה וימשוך מחדש; כפילויות נחסמות בענן.
- אין פאנצ'ים בכלל → בדוק `CLOCK_IP`, טוקן, ולוגים תחת `logs/agent.log`.

## סריקת עץ תיקיות (הרשאות מערכות)

ה-Agent יכול גם לסרוק את עץ התיקיות של כונן (למשל `P:\`) ולשלוח אותו למסך **הרשאות מערכות › עץ וקבוצות גישה**, כך שהעץ מתעדכן בלי ייבוא ידני. נשלחים רק שמות תיקיות, לא קבצים ולא תוכן.

1. במסך הרשאות מערכות, בלשונית עץ וקבוצות גישה, בוחרים את המערכת (כונן P) ולוחצים **חיבור סריקה אוטומטית**. המפתח מוצג פעם אחת.
2. מוסיפים ל-`.env` של מחשב שרואה את הכונן:

| משתנה | תיאור |
| --- | --- |
| `ACCESS_TREE_ROOT` | הכונן או השיתוף, למשל `P:\` או `\\FILESRV01\data` |
| `ACCESS_TREE_SYSTEM_ID` | מזהה המערכת, מוצג יחד עם המפתח |
| `ACCESS_TREE_TOKEN` | מפתח הסריקה |
| `ACCESS_TREE_DEPTH` | כמה רמות לסרוק (3) |
| `ACCESS_TREE_INTERVAL_HOURS` | כל כמה שעות (24) |
| `ACCESS_TREE_EXCLUDE` | שמות תיקיות לדילוג, מופרדים בפסיק |

3. בדיקה: `python access_tree.py --dry-run` מציג מה יישלח, ו-`python access_tree.py --once` שולח פעם אחת.

אם ה-Agent של הנוכחות רץ על אותו מחשב, הסריקה רצה בתוכו אוטומטית. אחרת, מריצים את `python access_tree.py` כמשימה מתוזמנת. ה-Agent צריך לרוץ בחשבון שרואה את כל התיקיות. תיקייה שאין לו הרשאה אליה לא תופיע בעץ.

תיקיות שנעלמו מסומנות "לא נמצא" ולא נמחקות. סריקה ריקה, למשל כשהכונן לא מחובר, לא נשלחת בכלל.
