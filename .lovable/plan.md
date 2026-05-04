## 1. ביטול הדיאלוג בהחתמה מרחוק

הכפתורים "כניסה" / "יציאה" בפורטל יבצעו החתמה ישירה בלחיצה אחת — ללא דיאלוג, ללא חתימה, ללא הערה.

**זרימה:**
- בלחיצה ראשונה — הדפדפן יבקש הרשאת מיקום פעם אחת. לאחר אישור, לא יישאל שוב.
- כל לחיצה קוראת ל-`navigator.geolocation.getCurrentPosition` — מיקום מוחזר שקוף.
- מיקום הוחזר → נשלח פאנץ' (`source: portal_remote`) עם הקואורדינטות ב-`raw_payload.geo`, מוצג toast "כניסה/יציאה נרשמה".
- הרשאה נדחתה → toast עם הסבר.
- בזמן איתור — הכפתור "מאתר מיקום…" ומושבת.

**שינויי קבצים:**
- `src/components/portal/RemotePunchDialog.tsx` — נמחק.
- `src/pages/EmployeePortal.tsx` — הסרת ה-Dialog; פונקציית `handlePunch(direction)` ישירה.
- `src/hooks/useAttendancePunches.ts` — `signatureDataUrl` הופך לאופציונלי.

## 2. מסך חדש: "מפת נוכחות חיה"

מסך המציג בזמן אמת את מיקום העובדים שביצעו החתמת כניסה היום, על גבי **Leaflet + OpenStreetMap** (חינמי, ללא API Key).

**הרשאות גישה:**
- `super_admin`, `admin`, `payroll` — רואים את כל עובדי החברה.
- `direct_manager` — רואה את כל הכפופים שלו **רקורסיבית** (כפופים של כפופים בכל עומק לפי `direct_manager_id`).
- שאר התפקידים — אין כניסה לדף, פריט הסרגל מוסתר.

**מימוש ההיררכיה הרקורסיבית — ב-DB:**

פונקציית RPC חדשה `get_subordinate_employee_ids(_manager_user_id)` עם CTE רקורסיבי על `direct_manager_id`, מסומנת `SECURITY DEFINER` עם `search_path = public`:

```sql
WITH RECURSIVE subs AS (
  SELECT e.id FROM employees e
  JOIN employees mgr ON mgr.id = e.direct_manager_id
  WHERE mgr.linked_user_id = _manager_user_id
  UNION
  SELECT e.id FROM employees e
  JOIN subs s ON e.direct_manager_id = s.id
)
SELECT id FROM subs;
```

פונקציית RPC `get_live_employee_locations(_company_id)` שמחזירה לכל עובד רלוונטי את הפאנץ' האחרון שלו היום עם `geo` לא ריק. בתוכה תיאכף הרשאה: super_admin/admin/payroll → כל עובדי החברה; אחרת → רק `get_subordinate_employee_ids(auth.uid())`. אם אין הרשאה — מוחזר ריק.

**תוכן המסך:**
- צד ימין: רשימת עובדים — שם, מחלקה, שעת כניסה אחרונה, סטטוס (בעבודה / יצא / ללא מיקום), סינון לפי מחלקה.
- צד שמאל: **מפת Leaflet אינטרקטיבית** (טייל-שכבת OSM) עם סיכות צבעוניות (ירוק = בעבודה, אפור = יצא). Popup עם שם, שעה, דיוק GPS וקישור "פתח ב-Google Maps".
- רענון אוטומטי דרך Supabase Realtime על `attendance_punches`, וכפתור רענון ידני.

## פרטים טכניים

**מיגרציה:**
- שתי פונקציות RPC חדשות (`get_subordinate_employee_ids`, `get_live_employee_locations`).
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_punches`.

**Dependencies חדשים:** `leaflet`, `react-leaflet`, `@types/leaflet`.

**קבצים חדשים:**
- `src/pages/AttendanceMap.tsx`
- `src/components/attendance/EmployeeMapView.tsx`
- `src/hooks/useLiveEmployeeLocations.ts`

**קבצים שמתעדכנים:**
- `src/App.tsx` — רישום ראוט `/attendance-map`.
- `src/components/AppSidebar.tsx` — פריט "מפת נוכחות" גלוי ל-`admin`, `payroll`, `direct_manager`, `super_admin`.
- `src/pages/EmployeePortal.tsx`, `src/hooks/useAttendancePunches.ts` — לפי סעיף 1.
- `src/index.css` — ייבוא `leaflet/dist/leaflet.css`.
