# תהליך קליטת עובד (Onboarding) — שלב א'

האפיון טוב ומדויק ברובו. שלוש הערות מהבדיקה בקוד לפני שמתחילים:

1. **כפילות offboarding אמיתית.** הטבלאות `offboarding_processes/items/forms` קיימות ב-DB, אבל **אין קוד UI שמשתמש בהן** — תהליך העזיבה החי רץ על `it_tickets` + `checklist` JSON (`useStartOffboarding`). לפי החלטתך, ה-onboarding ייבנה על המבנה החדש (processes/items), והעזיבה תישאר כרגע כפי שהיא.
2. **`useDashboardStats.activeEmployees` סופר את כל העובדים** ללא סינון סטטוס — נתקן תוך כדי ונוסיף `onboardingEmployees`.
3. `generateProtocolHtml` קיים היום בתוך `OffboardingDialog.tsx` — נחלץ אותו לקובץ משותף כדי לעשות בו שימוש חוזר לכיוון ההפוך (משיכת ציוד).

שלב א' מתמקד **בתהליך הקליטה בלבד**. שכבות התצוגה במסך המשאבים (תור פעולות מאוחד + קיבוץ מחדש של `DomainsGrid`) יבואו בשלב ב'.

## מה נבנה

### 1. מודל נתונים
- `onboarding_processes` — `id, company_id, employee_id, status ('draft'|'sent_to_ops'|'in_progress'|'completed'), created_by, created_at, completed_at, pdf_url`
- `onboarding_items` — `id, process_id, item_type, title, owner_role, catalog_ref_id → asset_categories, selected_group_id → asset_groups (nullable), fulfillment_type ('new_purchase'|'from_stock', nullable), asset_id (nullable), status, notes, completed_by, completed_at`
- `role_templates` — `id, company_id, role_name, department, default_items jsonb` (ב-MVP, לפי החלטתך)
- עמודה חדשה `asset_categories.onboarding_form_group` (5 ערכים: `workspace`, `equipment`, `travel`, `daily_systems`, `software`) — לא נוגעת ב-`domain`
- הרחבת enum `ticket_type` בערך `onboarding`
- RLS + GRANTs לכל טבלה חדשה, באותו דפוס של `offboarding_*`

### 2. דשבורד
כרטיס "עובדים בתהליך קליטה" ב-`Dashboard.tsx`, מראה מדויקת של כרטיס "עובדים בתהליך עזיבה" הקיים: `status === 'onboarding'`, ממוין לפי `start_date` עולה, ספירה לאחור בדפוס `expiryUrgency` — אדום כשמועד הקליטה עבר והתיק עדיין פתוח. תיקון `useDashboardStats` (סינון `active` + שדה `onboardingEmployees`).

### 3. מסך 1 — טופס צרכי קליטה (HR)
- נפתח מתיק העובד ומהכרטיס בדשבורד.
- מקובץ ל-5 בלוקים לפי `onboarding_form_group`: 🪑 מיקום עבודה · 💻 ציוד עבודה · 🚗 נסיעות ורכב · 🔐 מערכות יומיומיות · 📄 תוכנות ורישיונות.
- בראש הטופס: בחירת תבנית תפקיד/מחלקה (`role_templates`) שמסמנת אוטומטית ברירות מחדל, וכפתור "שכפל מעובד קיים" שטוען לפי ההחזקות של עמית (`get_employee_holdings`).
- לכל פריט: בחירת `asset_group` כשקיים, ושדה "אחראי" (`owner_role`).
- "שלח לתפעול" → `status = 'sent_to_ops'`, נעילת עריכה, ופתיחת קריאת IT מסוג `onboarding` עם SLA/מייל בצינור הקיים.

### 4. מסך 2 — צ'קליסט לתפעול
מקובץ לפי שיטת טיפול (מהשדות הקיימים):
- 🖐️ דורש מסירה פיזית + חתימה — `skip_handover_form = false`
- ⚡ הצמדה מיידית בלי טופס — `skip_handover_form = true`
- 🎫 רשיונות לתוכנות — `domain = licenses`
- 📋 רגולציה ונכסים — `training/insurance/real_estate`, מקופל כברירת מחדל

סימון "בוצע" על חומרה → בחירת `fulfillment_type` (חדש/ממלאי) + בחירת נכס עם `SearchableSelect` בדפוס `QuickAssignDialog`; פריט וירטואלי → הצמדה ישירה. `completed_by/completed_at` נכתבים אוטומטית. סיום כל הפריטים → `status = 'completed'` והעובד עובר ל-`active`.

### 5. פרוטוקול משיכת ציוד
חילוץ `generateProtocolHtml` מ-`OffboardingDialog.tsx` לקובץ משותף, והפעלתו בכיוון הצמדה (לא החזרה), עם לוגו החברה ו-RTL בדפוס `buildOffboardingProtocolPdf`. **פרוטוקול הרשאות עובד לחתימה — לא בשלב זה.**

### 6. דוח לכל אחראי
סינון `onboarding_items` לפי `owner_role`, באותו דפוס סינון שקיים ב-`ITTickets.tsx`.

## נקודות שנשארות פתוחות (לא חוסמות)
- פריוריטי/סמנטו כ-`asset_groups` — נשאר כפי שאופיין; מעבר לשדה-תכונה רק אם תופיע הגבלת כמות אמיתית.
- ויפלאס/בדקליק/תיקטק/משימון/היתר-GO נשארים קטגוריות נפרדות.
- אם יתווסף בעתיד מלאי מוגבל שאינו תוכנה (חניות וכו') — ייפתח בלוק חמישי "מלאי מוגבל אחר" ולא יידחס ל"רשיונות לתוכנות".

## פרטים טכניים
- קבצים חדשים: `src/hooks/useOnboarding.ts`, `src/components/onboarding/OnboardingNeedsForm.tsx`, `src/components/onboarding/OnboardingChecklist.tsx`, `src/components/dashboard/OnboardingCard.tsx`, `src/lib/pdf/buildHandoutProtocolPdf.ts`.
- קבצים שמשתנים: `src/hooks/useData.ts` (stats), `src/pages/Dashboard.tsx`, `src/pages/EmployeeDetail.tsx`, `src/components/OffboardingDialog.tsx` (חילוץ בלבד), `src/integrations/supabase/types.ts` (מתעדכן אוטומטית).
- כל השינויים ב-DB דרך migration אחד עם GRANTs ומדיניות RLS מלאה; שכבת הנתונים הקיימת (domains/categories/groups/expiries) לא נוגעים בה.
