# Attendance Clock Agent

Agent מקומי שקורא משעון הנוכחות הפיזי (`10.0.0.114`) ושולח את הפאנצ'ים ל-Lovable Cloud.

## התקנה

1. התקן Node.js 18+ על השרת המקומי.
2. העתק את התיקייה `agent/` לשרת.
3. התקן תלויות:
   ```bash
   cd agent
   npm install
   ```
4. צור קובץ `.env` (העתק מ-`.env.example`) ומלא:
   - `ATTENDANCE_INGEST_TOKEN` — הטוקן ששמור בענן
   - `COMPANY_ID` — ה-UUID של החברה במערכת (אפשר לקבל מהמסך "חברות" כמנהל-על)
   - `CLOCK_MODE` — `tcp` או `serial`
   - לפי המצב: `CLOCK_HOST`+`CLOCK_PORT` או `SERIAL_PATH`+`BAUD_RATE`

## הרצה ראשונית — מצב raw (כיול)

כדי לראות מה השעון בעצם שולח (לפני שמחליטים איך לפרסר):

```bash
node index.js --raw
```

זה ידפיס לכל פעימה גם את ה-bytes (hex) וגם את הטקסט. תפעיל פאנץ' אחד או שניים בשעון ותשלח לי את הפלט — אכייל את הפרסר.

## הרצה רגילה

```bash
node index.js
```

## הרצה כשירות (Linux / systemd)

צור קובץ `/etc/systemd/system/attendance-agent.service`:

```ini
[Unit]
Description=Attendance Clock Agent
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/attendance-agent
ExecStart=/usr/bin/node /opt/attendance-agent/index.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

הפעל:
```bash
sudo systemctl enable --now attendance-agent
sudo journalctl -u attendance-agent -f
```

## הרצה כשירות (Windows / NSSM)

```cmd
nssm install AttendanceAgent "C:\Program Files\nodejs\node.exe" "C:\agent\index.js"
nssm start AttendanceAgent
```

## פתרון בעיות

- **אין נתונים**: ודא שהשעון פתוח על `CLOCK_PORT`. רוב השעונים משתמשים ב-4370 (ZKTeco) או 3001 (Synel).
- **טוקן שגוי / 401**: בדוק ש-`ATTENDANCE_INGEST_TOKEN` בקובץ `.env` זהה בדיוק לסוד בענן.
- **"unmatched"**: מספר העובד שמגיע מהשעון לא תואם ל-`employee_code` במערכת. עדכן את הקוד בכרטיס העובד או נהל ידנית במסך "שעוני נוכחות".
