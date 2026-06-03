
# אינטגרציה עם G.I.T. Service Calls API

מטרה: סנכרון דו-כיווני בין `it_tickets` במערכת שלנו לבין מערכת הקריאות של G.I.T., כך שכל פתיחת/עדכון קריאה במערכת תיווצר גם אצל G.I.T., וכל שינוי אצלם יחזור אלינו. הרשימות הנפתחות בדיאלוג פתיחת הקריאה יהפכו דינמיות לפי החברה.

## 1. שינויי DB

**טבלה `companies` — שדות אינטגרציה:**
- `git_enabled` (bool)
- `git_custname` (text) — קוד הלקוח אצל G.I.T.
- `git_username` (text)
- `git_password_encrypted` (text) — pgcrypto + key מ-secret
- `git_base_url` (text, default `https://a.gold.org.il/api/v1`)
- `git_default_site_code` (text, אופציונלי)

**טבלה `it_tickets` — שדות מיפוי:**
- `git_sservname` (text) — מזהה הקריאה ב-G.I.T. (`SC00012345`)
- `git_synced_at`, `git_sync_status`, `git_sync_error`
- `git_site_code`, `git_sernum` (אופציונלי)
- `external_source` (text: `local` / `git`) — מונע לולאות סנכרון

**טבלה חדשה `git_lookups_cache`** — מטמון רשימות לכל חברה:
- `company_id`, `lookup_type` (`sites` / `devices` / `call_types` / `statuses` / `priorities`), `data` (jsonb), `fetched_at`
- TTL: 1 שעה לרשימות גדולות (sites/devices), 24h לרשימות יציבות (call_types/statuses/priorities).

**Secret חדש:** `GIT_CREDENTIALS_ENCRYPTION_KEY`.

## 2. Edge Functions

### `git-api-client` (מודול משותף)
- `login(companyId)` עם cache של 24h
- `request(companyId, method, path, body)` עם רענון אוטומטי
- פענוח סיסמה מוצפנת

### `git-lookups` (חדש — לטעינת הרשימות לדיאלוג)
- `GET /sites`, `GET /servicecall-types`, `GET /devices?site=X`
- בנוסף ערכים סטטיים שמתועדים ב-API:
  - **סטטוסים מותרים ללקוח**: `בפתיחה`, `מבוטל`
  - **דחיפויות**: `רגיל`, `מיידי`
- שמירה ב-`git_lookups_cache` עם invalidation.

### `git-sync-ticket` (push: אלינו → G.I.T.)
- על Insert: `POST /servicecalls` עם `CODE` (site), `SSERVDES` (כותרת), `SERNUM`, `SSLOCATION`, `PRIORLEVELDES`, `SSERVCALLTYPENAME`, `text` (תיאור).
- על Update: `PATCH /servicecalls/{id}` + `POST .../notes` להערות חדשות.
- שמירת `git_sservname` ושגיאות חזרה.

### `git-pull-tickets` (pull: G.I.T. → אלינו, cron 5 דק')
- לכל חברה עם `git_enabled`: `GET /servicecalls?status=open,progress&from=<last_sync>`
- מיפוי סטטוסים: `בפתיחה→open`, `בטיפול→in_progress`, `סגור/מבוטל→done`
- מיפוי דחיפות: `מיידי→critical`, `רגיל→medium`
- משיכת הערות → `checklist` עם `type:'git_note'`

## 3. שינויי UI

### `src/components/NewITTicketDialog.tsx` — רשימות דינמיות
כשהחברה מחוברת ל-G.I.T., כל ה-dropdowns ימשכו ערכים מ-`git-lookups` (עם React Query, cached):

| שדה | מקור היום | מקור חדש (חברת G.I.T.) |
|---|---|---|
| אתר | `sub_employers` | `GET /sites` (CODE + DCODEDES + ADDRESS) |
| ציוד / S/N | — (חדש) | `GET /devices?site=<CODE>` (SERNUM + PARTDES + LOCATION) |
| סוג קריאה | קבוע (`TICKET_TYPES`) | `GET /servicecall-types` (SSERVCALLTYPENAME + SSERVCALLTYPEDES) |
| סטטוס | `open/in_progress/done` | `בפתיחה` / `מבוטל` (מותרים ללקוח) |
| דחיפות | 4 ערכים מקומיים | `רגיל` / `מיידי` |

- כשהחברה לא מחוברת ל-G.I.T. → התנהגות נוכחית נשמרת ללא שינוי.
- שדה ציוד הוא חדש לחלוטין (מופיע רק לחברות G.I.T.), עם searchable-select.
- בחירת אתר מעדכנת בצורה דינמית את רשימת הציוד (נשלף לפי `site=CODE`).
- מיפוי דו-כיווני בעת שמירה: הערך המקומי (`open`) נשמר ב-DB שלנו, והערך העברי (`בפתיחה`) נשלח ל-G.I.T. דרך `git-sync-ticket`.
- אינדיקטור קטן מעל הדיאלוג: "🔄 הקריאה תיפתח גם במערכת G.I.T."

### `src/pages/ITTickets.tsx`
- Badge חדש "G.I.T." עם מזהה `SC...` + tooltip סטטוס סנכרון.
- אייקון "סנכרן שוב" לקריאות שנכשלו.
- כפתור גלובלי "משוך מ-G.I.T.".

### `src/components/CompanySettings` — tab חדש "אינטגרציית G.I.T."
- Toggle הפעלה
- שדות: שם משתמש, סיסמה, CUSTNAME, Base URL, קוד אתר ברירת מחדל
- כפתור "בדיקת חיבור" (מציג שם חברה + מ