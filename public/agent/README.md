# Public Agent Releases

קבצים אלו מתפרסמים יחד עם האתר ב-`https://tiful360.com/agent/`.
הסוכן בודק את `manifest.json` כל שעה, ואם מספר הגרסה גבוה מהמותקן —
מוריד את הקבצים, מגבה את הקיימים ב-`.update-backup/`, מחליף, ומבצע restart.

## בעדכון קוד הסוכן

1. ערוך את הקבצים תחת `agent/`.
2. העלה את `version` ב-`agent/package.json` ובקבוע `AGENT_VERSION` ב-`agent/index.js`.
3. הרץ את הסקריפט הזה כדי לסנכרן את `public/agent/` ולחתום מחדש:

```bash
bash scripts/publish-agent.sh
```

4. פרסם את הפרויקט (Publish). מרגע הפרסום — הסוכן יזהה את הגרסה החדשה בבדיקת ה-1h הבאה (או מיד אם יורידו אותו ידנית).
