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
- אין פאנצ'ים → מחק את `state.json` כדי לכפות backfill מלא.
