
# מחיקת ה-agent הישן ובנייה מחדש ב-Python

## שלב 1 — מחיקה מלאה של הקוד הישן

נמחקים:
- `agent/` — כל ה-Node agent (index.js, updater.js, setup.js, install-service.js, uninstall-service.js, probe.js, repair-service.ps1, package.json, README.md)
- `public/agent/` — כל הקבצים שמשרתים את ה-agent הישן וה-manifest
- `scripts/publish-agent.sh` — סקריפט הפרסום של ה-manifest הישן
- כל reference ב-`package.json` הראשי ל-`publish:agent`

**לא נמחקים** (נשארים כמו שהם):
- `supabase/functions/ingest-attendance-punch/`
- `supabase/functions/ingest-attendance-heartbeat/`
- `supabase/functions/list-companies-for-agent/`
- מסכי השעון/הנוכחות ב-UI

## שלב 2 — בניית `agent-py/` מאפס

מבנה:

```text
agent-py/
  main.py              # לולאה ראשית: live_capture + polling fallback + heartbeat
  zk_client.py         # עטיפה ל-pyzk (TCP בלבד)
  uploader.py          # POST ל-ingest-attendance-punch + retry/backoff
  heartbeat.py         # POST ל-ingest-attendance-heartbeat כל דקה
  state.py             # state.json — last_punch_at למניעת כפילויות
  config.py            # טעינת .env
  setup.py             # אשף אינטראקטיבי: token, company_id, clock IP
  service_windows.py   # התקנה/הסרה כ-Windows Service (pywin32)
  requirements.txt     # pyzk, requests, python-dotenv, pywin32
  .env.example
  README.md
```

### תכונות

1. **חיבור TCP בלבד** ל-ZKTeco דרך pyzk (מה שהוכח שעובד).
2. **Live capture** כברירת מחדל — השעון דוחף פאנצ'ים בזמן אמת.
3. **Polling fallback** כל 30 שניות (`get_attendance` + סינון לפי state).
4. **שליחה ל-Cloud** — batch של עד 100, retry עם backoff, ה-API לא משתנה בכלל.
5. **Heartbeat** כל דקה עם `agent_version`, `clock_ip`, `last_punch_at`.
6. **לוגים** — `logs/agent.log` עם rotation + stdout.
7. **בלי updater אוטומטי בכלל** — הסיבוך הזה גרם לכל הבעיות. עדכון = הרצת `setup.py` מחדש.

### הוראות שימוש (שלב ראשון — ידני, לפני אריזה ל-exe)

```powershell
# הסרת ה-agent הישן
sc.exe stop  "Tiful360 Attendance Agent"
sc.exe delete "Tiful360 Attendance Agent"
Remove-Item C:\attendance-agent -Recurse -Force -ErrorAction SilentlyContinue

# התקנת החדש
git clone <repo> tiful-agent
cd tiful-agent\agent-py
python -m pip install -r requirements.txt
python setup.py    # מבקש token, company_id, IP
python main.py     # בדיקה — אמור להתחיל לשלוח פאנצ'ים
```

אחרי שזה עובד מולך → ארוז ל-Service:
```powershell
python service_windows.py install
python service_windows.py start
```

### שלב 3 (עתידי, רק אחרי שאמת)
אריזה ל-`tiful-agent.exe` בודד עם PyInstaller, כך שאין צורך כלל ב-Python במחשב היעד.

## פרטים טכניים

- Python 3.11.
- `pyzk==0.9` — הסטנדרט בתעשייה לתקשורת עם ZKTeco, מטפלת בפרוטוקול לבד.
- ה-`.env` יכלול: `INGEST_URL`, `INGEST_TOKEN`, `COMPANY_ID`, `CLOCK_IP`, `CLOCK_PORT=4370`, `EMPLOYEE_CODE_PREFIX` (אופציונלי), `POLL_INTERVAL=30`.
- שום שינוי ב-edge functions או בסכמת DB.

מאשר שאמחק את `agent/` ו-`public/agent/` ואבנה את `agent-py/`?
