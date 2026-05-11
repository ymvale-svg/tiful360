# Attendance Clock Agent — ZKTeco U560

Agent מקומי שמושך פאנצ'ים משעון ZKTeco ושולח ל-Lovable Cloud.

## התקנה — 3 פקודות

```bash
npm install
npm run setup
```

`npm run setup` הוא מתקין אינטראקטיבי שעושה הכול:

- שואל רק 4 שדות (טוקן, חברה, IP של השעון, קידומת קוד עובד).
- אם אינך יודע את `COMPANY_ID` — לחץ Enter והוא יציג רשימת חברות מהענן לבחירה.
- כותב `.env` תקין עם ברירות מחדל לכל שאר השדות.
- בודק שהשעון זמין ברשת.
- בסוף שואל אם להתקין כ-Windows Service ומריץ אוטומטית (חובה cmd כ-Administrator).

זהו — ה-Agent רץ.

## העברה למחשב חדש

```bash
git pull   # או העתקת התיקייה
npm install
npm run setup
```

## פקודות שימושיות

```bash
npm start                  # ריצה רגילה (פולינג)
npm run once               # מחזור אחד ויציאה
npm run raw                # רואה רשומות גולמיות מהשעון
npm run service:install    # התקנה כ-Service (cmd כ-Administrator)
npm run service:uninstall  # הסרת Service
```

## סטטוס Service (Windows)

`services.msc` → "Tiful360 Attendance Agent" → Start / Stop / Restart.

לוגים: תיקיית `daemon/` בתוך תיקיית ה-agent.

## תקלה? .env נמחק או חסר?

הרץ `npm run setup` שוב — זה משחזר הכול.
