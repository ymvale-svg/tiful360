# הפיכת ה-agent ל-Windows Service

המטרה: שה-agent ירוץ ברקע אוטומטית גם בלי שמישהו פתח חלון, יתחיל יחד עם Windows, ויקום אוטומטית אם נפל.

## הגישה

נשתמש בחבילה `node-windows` שעוטפת את ה-Service Manager של Windows. נוסיף שני סקריפטים קטנים:
- `install-service.js` — מתקין את ה-service
- `uninstall-service.js` — מסיר אותו

## שינויים בקבצים

### 1. `agent/package.json`
להוסיף תלות ב-`node-windows` ו-scripts חדשים:
```
"scripts": {
  "start": "node index.js",
  "once": "node index.js --once",
  "service:install": "node install-service.js",
  "service:uninstall": "node uninstall-service.js"
},
"dependencies": {
  "node-zklib": "^1.1.10",
  "node-windows": "^1.0.0-beta.8"
}
```

### 2. `agent/install-service.js` (חדש)
סקריפט שמגדיר Service בשם **"Tiful360 Attendance Agent"**:
- מצביע על `index.js`
- `description` ברור
- `wait: 2`, `grow: .5`, `maxRestarts: 40` — restart אוטומטי אם נפל
- מדפיס הודעה כשההתקנה הצליחה ומפעיל את ה-service מיד

### 3. `agent/uninstall-service.js` (חדש)
עוצר ומסיר את ה-service.

### 4. `agent/README.md`
להוסיף סעיף "התקנה כ-Windows Service" עם ההוראות בעברית.

## איך המשתמש מפעיל

פעם אחת בלבד, ב-cmd **כ-Administrator** (חשוב!):

```cmd
cd /d "%USERPROFILE%\Desktop\agent"
npm install
npm run service:install
```

מאותו רגע:
- ה-agent רץ ברקע, גם אם החלון נסגר
- מתחיל אוטומטית בכל הדלקה של המחשב
- אם קרס — Windows מפעיל אותו מחדש
- לוגים נשמרים אוטומטית ב-`%USERPROFILE%\Desktop\agent\daemon\`

לעצור / להפעיל ידנית: `services.msc` → "Tiful360 Attendance Agent".

להסרה:
```cmd
npm run service:uninstall
```

## דברים שחשוב להזכיר למשתמש

1. **חייב להריץ כ-Administrator** את `service:install` (אחרת Windows חוסם).
2. ה-`.env` ו-`state.json` חייבים להישאר בתיקיית `agent` — ה-service רץ משם.
3. אם המחשב נכבה לגמרי בלילה — אין נתונים. אם רוצים סנכרון 24/7 צריך מחשב שדלוק תמיד (או שרת קטן ברשת של השעון).

## הערה לגבי תמיכה

`node-windows` עובד רק על Windows. אם בעתיד נריץ על Linux, נשתמש ב-`systemd` במקום (סקריפט נפרד).
