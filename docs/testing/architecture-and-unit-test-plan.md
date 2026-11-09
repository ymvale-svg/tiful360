# תוכנית ארכיטקטורה ובדיקות יחידה – tiful360

> **מטרה:** כל מערכת ב-tiful360 עובדת ונבדקת **בפני עצמה**: בלי Supabase אמיתי, בלי רשת ובלי תלות בשכבה אחרת. שינויי הקוד שנדרשים כדי שאפשר יהיה לבדוק אותה כך הם חלק מהתוכנית.
>
> המסמך בנוי מחבילות עבודה (WP). כל חבילה כוללת **שינוי קוד**, **בדיקות** ו**תנאי סיום**, ונכנסת כ-PR נפרד שאפשר להחזיר אחורה.

---

## חלק א' – ממצאים מהקוד (נובמבר 2026)

### א.1 כיסוי בדיקות

| רכיב | היקף | כיסוי היום |
|---|---|---|
| `src/lib` | 53 מודולים + `mcp/` | 27 מכוסים, 27 בלי בדיקה |
| `src/hooks` | 40 hooks | 3 |
| `src/components` | 79 + 15 תיקיות תחום | כ-15, בעיקר `ui`/`feedback` |
| `src/pages` | 28 מסכים | 0 |
| `supabase/functions` | 35 פונקציות + `_shared` | 3 מודולי `_shared` |
| `supabase/migrations` | 160 מיגרציות, כ-75 פונקציות DB, טריגרים, RLS | 0 |

### א.2 בעיות ארכיטקטורה שמונעות בדיקה מבודדת

| # | ממצא | איפה | למה זה מפריע |
|---|---|---|---|
| F1 | **גישה ישירה ל-Supabase מה-UI**: 41 רכיבים ו-11 מסכים קוראים ל-`supabase.from/rpc/functions/storage` | למשל `MonthlyAttendanceReview` (11 קריאות), `PortalLearningManager` (9), `HandoverFlow` (6), `InsuranceDetailsPanel` (6), `ITTickets` (5) | אי אפשר לבדוק UI בלי לדמות את כל ה-client. לוגיקת נתונים מפוזרת ולא נבדקת |
| F2 | **Edge Functions מונוליטיות**: כל הלוגיקה בתוך `Deno.serve` ב-`index.ts` | `ai-assistant` (1,326 שורות), `split-payslips` (876), `manage-users` (562) | אין דרך לייבא ולבדוק את הלוגיקה. `Deno.env` ו-`createClient` נקראים בתוך ה-handler |
| F3 | **שכפול תשתית ב-Edge Functions**: `corsHeaders` מוגדר מחדש ב-17 פונקציות, 3 גרסאות של `supabase-js` (`@2`, `@2.103.0`, `@2.45.0`), ו-6 מנגנוני אימות שונים (JWT, `x-api-key`, טוקן, cron) | כל `supabase/functions/*` | כל פונקציה ממציאה מחדש אימות והרשאה, ולכן כל אחת צריכה בדיקה מלאה משלה |
| F4 | **שכפול טיפוס התפקידים**: `AppRole` מוגדר גם ב-`screenAccess.ts` וגם ב-`domainConfig.ts`, והגרסה השנייה חסרה את `secretariat` ו-`ceo` | `src/lib/domainConfig.ts:3` | סטייה שקטה מהמקור היחיד. מפר את חוק "Screen and tab role lists live only in screenAccess" |
| F5 | **`src/lib` מייבא משכבות עליונות** (type-only): `dashboardConfig`, `dualAccess`, `landingRoute`, `permissionGroups`, `expiringResourceTargets` מייבאים מ-`@/hooks/*`, ו-`validateTax101` מייבא מ-`@/components/Tax101Dialog` | `src/lib/*.ts` | שכבת הלוגיקה תלויה ב-UI. אי אפשר לבדוק ולהעביר אותה בנפרד |
| F6 | **רכיבי-על**: `Tax101Dialog` (1,595 שורות), `AddAssetDialog` (1,541), `CategoryManager` (1,472), `AssetsDomainPage` (1,323), `HandoverFlow` (1,023), `EmployeePortal` (1,003) | | ולידציה, חישובים, קריאות נתונים ו-JSX מעורבבים בקובץ אחד |
| F7 | **ערבוב הרשאות**: `manage-users` מחשב הרשאות מ-`user_roles` בקוד מקומי. `useOnboardingProtocol` ו-`useAuth` קוראים את `user_roles` כל אחד בעצמו | | אותו חוק הרשאה ממומש בכמה מקומות, ולכן קשה לבדוק אותו אחת ולתמיד |

---

## חלק ב' – ארכיטקטורת היעד

```
┌──────────────────────────────────────────────────────────────┐
│ pages/            הרכבה בלבד: טאבים, layout, ניתוב           │
│ components/<תחום>/  UI + מצב מקומי. מקבל נתונים מ-hooks       │
│ components/ui, feedback   design system, ללא נתונים           │
├──────────────────────────────────────────────────────────────┤
│ hooks/            React Query: מפתחות, invalidation, מצב       │
├──────────────────────────────────────────────────────────────┤
│ services/<תחום>.ts  ★חדש★ כל הגישה ל-Supabase, פונקציות async  │
│                    שמקבלות client כפרמטר (ניתן להזרקה)         │
├──────────────────────────────────────────────────────────────┤
│ lib/  + domain/   לוגיקה טהורה: ולידציה, חישובים, טיפוסים     │
│                   (ללא React, ללא Supabase)                   │
└──────────────────────────────────────────────────────────────┘
Edge:  index.ts (wiring) → handler.ts (טהור, deps מוזרקים) → _shared/http, auth, db
DB:    RLS + טריגרים + פונקציות אטומיות. נבדק ב-pgTAP
```

**כללי תלות (נאכפים בבדיקה, WP-1):**
1. `lib` ו-`domain` לא מייבאים מאף שכבה אחרת.
2. `services` מייבאים רק מ-`lib`/`domain` ומטיפוסי Supabase.
3. `hooks` מייבאים מ-`services` ומ-`lib`. אסור להם לייבא את `supabase` client ישירות (מלבד `useAuth`).
4. `components` ו-`pages` לא מייבאים את `@/integrations/supabase/client`.
5. ב-Edge Functions, `handler.ts` לא קורא ל-`Deno.env` ולא ל-`createClient`. הוא מקבל `deps`.

---

## חלק ג' – חבילות עבודה

סדר החבילות נקבע כך שכל אחת מאפשרת את הבאה, ושהסיכון הגבוה (הרשאות, שכר, בידוד חברות) מטופל ראשון.

### WP-0 · תשתית בדיקות ו-CI (שבוע 1)

**שינוי קוד**
- `src/test/helpers/supabaseFake.ts`: fake ל-client עם builder שרשרתי (`from().select().eq()…`), `rpc`, `functions.invoke`, `storage` ו-`auth`. רושם כל קריאה (טבלה, פילטרים, payload) כדי שאפשר יהיה לבדוק בדיוק מה נשלח.
- `src/test/helpers/renderWithProviders.tsx`: `QueryClient` (retry כבוי), `MemoryRouter`, ו-Auth/Company מדומים עם פרמטרים `roles`, `isSuperAdmin`, `companyId`.
- `src/test/helpers/factories.ts`: employee, asset, ticket, company, permission group, payslip, leave.
- `vitest.config.ts`: להוסיף `supabase/functions/**/*.test.ts` ל-`include`, ולהוסיף coverage (v8) עם thresholds התחלתיים לפי המצב הנוכחי.
- `.github/workflows/test.yml`: `bun install --frozen-lockfile`, אחר כך `bun run lint`, אחר כך `bun run test --coverage`.
- סידור `src/test/` לתתי-תיקיות: `architecture/`, `lib/`, `services/`, `hooks/`, `components/`, `pages/`, `edge/`, `helpers/`.

**בדיקות:** להעביר 2–3 בדיקות קיימות (`offboarding`, `ticketHandlingStatus`) ל-`supabaseFake` כהוכחה שה-fake עובד.
**תנאי סיום:** CI ירוק ב-PR, ודוח כיסוי מתפרסם.

---

### WP-1 · שומרי ארכיטקטורה (שבוע 1–2)

**שינוי קוד**
- **F4:** למחוק את `AppRole` מ-`domainConfig.ts` ולייבא אותו מ-`screenAccess.ts`.
- **F5:** להעביר את הטיפוסים `AppRole`, `ProtocolDomain`, `ExpiringAsset` ו-`Tax101FormData` ל-`src/domain/types.ts` (או ל-`src/lib/types/`). ה-hooks והרכיבים ייבאו משם.

**בדיקות (`src/test/architecture/`)**: סריקה סטטית בעזרת `fs` + regex או AST. הקבצים שכבר מפרים כל כלל נכנסים ל-**allowlist שהולכת ומצטמצמת**: הבדיקה נכשלת על כל הפרה *חדשה*, ונכשלת גם כשקובץ שתוקן לא הוצא מהרשימה.

| בדיקה | כלל | חוק ב-AGENTS.md |
|---|---|---|
| `layering.test.ts` | כללי התלות 1–5 מחלק ב'. allowlist ראשונית של 41 רכיבים ו-11 מסכים (F1) | – |
| `singleRoleSource.test.ts` | אין `type AppRole =` מחוץ ל-`screenAccess.ts`. כל route, sidebar, טאב ו-GlobalSearch קוראים ל-`SCREEN_ROLES`/`canAccess` | Screen and tab role lists |
| `noNativeDialogs.test.ts` | אין `window.confirm/prompt/alert` ב-`src/` (המצב היום נקי, הבדיקה שומרת שיישאר כך) | shared feedback components |
| `mcpReadOnly.test.ts` | ב-`src/lib/mcp/tools` אין כתיבה ואין טבלאות שכר | App MCP |
| `mesimonBoundary.test.ts` | ה-URL של Mesimon מופיע רק ב-`create-mesimon-task`, וזו בודקת `MESIMON_COMPANY_IDS` | Mesimon |
| `emailLayout.test.ts` | כל תבנית עטופה ב-`EmailLayout`, כל שליחת HTML עוברת `formatEmailHtml`, ואין company ברירת מחדל גלובלית | email-theme |
| `spreadsheetAdapter.test.ts` | אין `from "xlsx"` מחוץ ל-`src/lib/xlsx.ts` | spreadsheet adapter |
| `userRolesWrites.test.ts` | כתיבות ל-`user_roles` רק עם `super_admin`/`employee` | permission groups |
| `categoryFieldsCompany.test.ts` | אף insert ל-`category_fields` לא שולח `company_id` | category_fields trigger |
| `payslipNoBulkDelete.test.ts` | כל `delete()` על `payslips` מסונן לפי `employee_id`/`id_number_detected` ותקופה | split-payslips |
| `edgeFunctionShape.test.ts` | לכל פונקציה ברשימה שכבר הומרה (WP-4) יש `handler.ts`, ו-`index.ts` לא עובר 30 שורות | – |

**תנאי סיום:** F4 ו-F5 תוקנו, כל חוקי `AGENTS.md` מכוסים, וה-allowlist מתועדת.

---

### WP-2 · שכבת לוגיקה טהורה `src/lib` (שבוע 2–3)

**שינוי קוד:** בדרך כלל אין צורך. איפה שפונקציה קוראת לשעון, ל-`localStorage` או ל-`fetch`, מוסיפים פרמטר אופציונלי (`now = () => new Date()`).

**בדיקות:** 27 המודולים בלי בדיקה, לפי סדר סיכון:

| עדיפות | מודולים | מקרים חשובים |
|---|---|---|
| P0 הרשאות | `permissionGroups`, `permissionAudit`, `managedUsers`, `dualAccess`, `authErrors`, ולהרחיב את `screenAccess` ו-`oauth-return-path` | union של קבוצות → תפקידים; super-admin מול `strict`; open redirect (`//evil`, `javascript:`, דומיין זר) |
| P0 שכר/מס | `validateTax101`, `tax101Url`, `generateTax101Pdf` (בניית הנתונים בלבד) | ת"ז שגויה, שדות חובה, תאריכי גבול, RTL |
| P1 חתימות/קבצים | `signLink`, `signedFormUpload`, `handoverUrl`, `handoverFields`, `handoverDraft` | טוקן פג, נתיב storage עם company id, `../` |
| P1 נכסים | `assetDomains`, `domainConfig`, `vehicleLinkedGroups`, `builtinFields` | מיפוי דומיין → route, קיבוץ |
| P2 | `dashboardConfig`, `notificationCenter`, `googleCalendar`, `hebrewBirthday`, `categoryIcons`, `utils`, `webmcp-telemetry` (fail-open), `lazyWithReload`, `videoCompress` | שנה מעוברת עברית, reload חד-פעמי |

**תנאי סיום:** כיסוי שורות של `src/lib` לפחות 90%.

---

### WP-3 · שכבת services: הוצאת הגישה ל-Supabase מה-UI (שבוע 3–6, מדורג)

**שינוי קוד:** פותר את F1 ואת F7. לכל תחום נוצר `src/services/<domain>.ts` עם פונקציות שמקבלות `client`:
```ts
// src/services/attendance.ts
export async function listMonthlyReview(db: Db, companyId: string, month: string) { … }
export async function approveCorrection(db: Db, id: string, note?: string) { … }
```
ה-hook עוטף את ה-service ב-React Query, והרכיב משתמש ב-hook בלבד. אחרי כל העברה מוציאים את הקובץ מה-allowlist של `layering.test.ts`.

| גל | תחום | קבצים להעביר |
|---|---|---|
| 3a | הרשאות ומשתמשים | `useAuth`, `useOnboardingProtocol` (קריאת `user_roles`), `UsersAndRolesTab`, `ManageGroupsDialog`, `PermissionGroupsTab` → `services/access.ts` (מקור יחיד לבדיקת תפקיד, F7) |
| 3b | שכר ונוכחות | `MonthlyAttendanceReview`, `AttendanceSettingsSection`, `PayslipsUploadDialog`, `EmployeePayslipsTab`, `Payroll.tsx` → `services/payroll.ts`, `services/attendance.ts` |
| 3c | חפיפה וחתימות | `HandoverFlow`, `MultiHandoverFlow`, `SignHandover.tsx`, `SignOffboarding.tsx`, `Tax101TokenPage.tsx` → `services/handover.ts`, `services/signing.ts` |
| 3d | נכסים | `AddAssetDialog`, `RenewExpiryDialog`, `InsuranceDetailsPanel`, `ImportExcelDialog` → `services/assets.ts` |
| 3e | קריאות שירות | `ITTickets.tsx`, `TicketBoard` → `services/tickets.ts` |
| 3f | הגדרות ופורטל | `PortalLearningManager`, `PortalSettingsTab`, `Settings.tsx`, `Companies.tsx`, `EmployeeDetail.tsx` |

**בדיקות לכל service** (`src/test/services/`) עם `supabaseFake`:
1. **בידוד חברה:** כל שאילתה מסוננת לפי `company_id`.
2. **חוזה כתיבה:** payload ופרמטרי RPC מדויקים, בלי שדות שהשרת אמור לקבוע (actor, `company_id` של `category_fields`).
3. **שגיאה:** שגיאת Supabase נזרקת ואין side-effect נוסף.

**בדיקות לכל hook** (`src/test/hooks/`): ה-service מדומה. בודקים query keys, invalidation אחרי mutation, ו-`enabled` כשאין חברה.

**תנאי סיום לכל גל:** הקבצים יצאו מה-allowlist, ה-services וה-hooks של הגל מכוסים, ובדיקה ידנית בדפדפן של המסך שהשתנה.
**סיכון:** שינוי התנהגות בזמן העברה. כדי למזער אותו, ההעברה מכנית בלבד (אותן שאילתות), וכל שיפור נכנס ב-PR נפרד.

---

### WP-4 · Edge Functions: פיצול ל-handler טהור (שבוע 4–7)

**שינוי קוד:** פותר את F2 ואת F3.
1. **`_shared/http.ts`:** `corsHeaders`, `json(body, status)`, `handleOptions`, ומיפוי שגיאות. מחליף את 17 ההגדרות הכפולות.
2. **`_shared/auth.ts`:** `requireUser(req, deps)`, `requireRole(user, list)`, `requireApiKey(req, env)`, `requireCron(req, env)`, ו-`assertSameCompany`. מקור יחיד לכל 6 מנגנוני האימות.
3. **`_shared/deps.ts`:** `realDeps()` יוצר `adminClient`, `userClient(authHeader)`, `env`, `now`, `sendEmail` ו-`fetch`. גרסת `supabase-js` אחת לכל הפונקציות (דרך `import_map`/`deno.json` משותף).
4. **תבנית לכל פונקציה:**
   ```ts
   // handler.ts
   export async function handle(req: Request, deps: Deps): Promise<Response> { … }
   // index.ts
   import { handle } from "./handler.ts"; import { realDeps } from "../_shared/deps.ts";
   Deno.serve((req) => handle(req, realDeps()));
   ```
5. **פירוק לוגיקה ייעודית:**
   - `split-payslips`: `parse.ts` (`findIdNumber`, `extractPeriod`, `extractFields`, `normalizeIdNumber`), `match.ts` (שיוך לעובד) ו-`persist.ts` (upsert לפי עובד+תקופה).
   - `manage-users`: `permissions.ts` (מי מורשה לאיזו action), `roles.ts` (`setRoleInCompany`) ו-`audit.ts`.
   - `ai-assistant`: tool לכל קובץ תחת `tools/`, עם רשימת הרשאות לכל tool.

**סדר הפיצול ובדיקות** (`supabase/functions/**/handler.test.ts`, רץ ב-Vitest כמו `ticketHandlingStatus.test.ts`):

| עדיפות | פונקציה | בדיקות חובה מעבר לבסיס* |
|---|---|---|
| P0 | `manage-users` | כל action × כל תפקיד (מטריצה); שורת `permission_audit_log` עם המבצע האמיתי; אין ניהול של חברה אחרת; `resolveAppOrigin` |
| P0 | `split-payslips` | parse על דוגמאות טקסט (LTR/RTL, רעש, ת"ז עם אפסים); העלאה חלקית לא נוגעת בעובדים אחרים; לא משויך → מחליף רק אותה ת"ז+תקופה |
| P0 | `create-mesimon-task`, `it-api` | חברה לא מורשית → 403 בלי קריאה החוצה; סגירה → מייל לפותח |
| P0 | `mcp`, `list-companies-for-agent` | client לפי caller; access-block; read-only |
| P1 | `reply-it-ticket`, `notify-it-ticket` | `markTicketInProgress` מותנה ב-`open` |
| P1 | `ingest-attendance-punch/heartbeat` | אימות מכשיר, כפילויות, אזור זמן ישראל |
| P1 | `sign-form-upload-url`, `tax-form-101-signed-url`, `send-handover-sign-link` | טוקן פג, נתיב לפי חברה |
| P2 | כל `send-*`/`notify-*`, `auth-email-hook` | brand מהחברה המפעילה, `formatEmailHtml`, נמענים |
| P2 | `ai-assistant` | כל tool: הרשאה + בידוד חברה; מחיקה (`index.ts:1037`) מוגבלת לחברה |

\* **בסיס לכל פונקציה:** OPTIONS/CORS, בלי אימות → 401, תפקיד לא מתאים → 403, קלט לא תקין → 400, נתיב הצלחה.

**בדיקות ל-`_shared`:** `http`, `auth`, `email-brand`, `email-html`, `enqueueEmail`, `htmlToText`, `formatDate`.
**תנאי סיום:** כל P0 ו-P1 בתבנית החדשה, `_shared` מכוסה לפחות 85%, ו-`edgeFunctionShape.test.ts` אוכף את הרשימה. לפני פריסה: `supabase functions serve` מקומי ובדיקת עשן לכל פונקציה שהומרה.

---

### WP-5 · פירוק רכיבי-על (שבוע 6–8)

**שינוי קוד:** פותר את F6. מכל רכיב-על מוציאים:
- **לוגיקה טהורה** ל-`lib`/`domain`, למשל `tax101/compute.ts` (חישובי נקודות זיכוי ומצב), `assetForm/validate.ts` ו-`categoryScope.ts`.
- **hook מצב** (`useTax101Form`, `useAssetForm`) עם reducer שניתן לבדוק בלי DOM.
- **תתי-רכיבים לפי שלב או טאב**, כל אחד עד כ-300 שורות.

| רכיב | יעד |
|---|---|
| `Tax101Dialog` (1,595) | שלבי טופס + `tax101/compute.ts` + `validateTax101` |
| `AddAssetDialog` (1,541), `EditAssetDialog` (693) | טופס משותף `AssetForm` + `assetForm/validate.ts` |
| `CategoryManager` (1,472) | `CategoryEditor` / `SubCategoryEditor` נפרדים (חוק ההקשרים הנפרדים) + `categoryScope.ts` |
| `AssetsDomainPage` (1,323) | טבלה סמנטית, פילטרים, פעולות מרובות |
| `HandoverFlow` / `MultiHandoverFlow` | מנוע שלבים משותף + `services/handover.ts` |
| `EmployeePortal` (1,003) | רכיב לכל טאב (`portalTabs` כבר קיים) |

**בדיקות:** reducer ו-compute בבדיקות טהורות; תתי-רכיבים עם `renderWithProviders` ו-hooks מדומים (ולידציה, מצב כפתור שמירה, `useConfirm` לפני פעולה הרסנית, `useDirtyGuard`).
**תנאי סיום:** אין קובץ ב-`src/components` או ב-`src/pages` מעל 600 שורות (נאכף בבדיקת ארכיטקטורה עם allowlist).

---

### WP-6 · רכיבים משותפים ומסכים (לאורך כל התקופה)

- **`components/ui` ו-`feedback`:** כל רכיב נבדק לבד, כולל נגישות (role, label, מקלדת), מצבי `StateView`, `useConfirm`, `undoToast`, `useDirtyGuard`, `FileDrop`, `IconButton` (חובת `aria-label`) ו-`runBatch`.
- **ניתוב והרשאות:** `ProtectedRoute`, `AppSidebar`, `SessionHomeRedirect` ו-`OAuthReturnRedirect` נבדקים ב-`test.each` על כל צירוף של תפקיד × מסך מתוך `SCREEN_ROLES`.
- **מסכים:** smoke test לכל אחד מ-28 המסכים עם hooks מדומים (loading/error/empty, טאבים לפי תפקיד), בלי לחזור על לוגיקה שנבדקה בשכבות התחתונות.

---

### WP-7 · מסד נתונים: pgTAP (שבוע 5–7, במקביל ל-WP-4)

**שינוי קוד:** `supabase/tests/*.sql` ו-job ב-CI שמריץ `supabase start && supabase test db`. כל בדיקה רצה בטרנזקציה ומתגלגלת אחורה, כך שכל פונקציה ב-DB נבדקת לבד.

| קובץ | מה נבדק |
|---|---|
| `rls_tenant_isolation.sql` | לכל טבלה עם `company_id` (רשימה שנוצרת אוטומטית מ-`information_schema`): משתמש מחברה A לא קורא ולא כותב שורות של חברה B. טבלה חדשה בלי RLS → הבדיקה נכשלת |
| `permission_groups.sql` | חברה חדשה מקבלת קבוצות ברירת מחדל; `user_roles` הוא ה-union |
| `permission_audit_log.sql` | כתיבה ישירה נרשמת; `UPDATE`/`DELETE` על היומן נכשלים |
| `category_fields_company.sql` | `company_id` נקבע מהקטגוריה גם כשהקליינט שולח ערך אחר |
| `start_employee_offboarding.sql` | אטומי (כשל → rollback מלא); tenant; actor ו-snapshot של שם |
| `payroll_privacy.sql` | תלוש גלוי רק לעובד עצמו ול-payroll של אותה חברה |

---

## חלק ד' – לוח זמנים ויעדים

| שבוע | חבילות | יעד מדיד ב-CI |
|---|---|---|
| 1 | WP-0, WP-1 | CI ירוק; כל חוקי AGENTS.md מכוסים; F4 ו-F5 תוקנו |
| 2–3 | WP-2, WP-3a | `src/lib` ≥ 90%; services/access מכוסה |
| 3–6 | WP-3b–3f | allowlist של גישה ישירה ל-Supabase מ-52 ל-0 |
| 4–7 | WP-4, WP-7 | P0+P1 בתבנית handler; `_shared` ≥ 85%; RLS לכל טבלה |
| 6–8 | WP-5, WP-6 | אין קובץ UI מעל 600 שורות; smoke לכל מסך; `src/hooks` ≥ 70% |

ה-thresholds עולים אחרי כל חבילה. PR שמוריד כיסוי, או מוסיף הפרה ל-allowlist, נחסם.

## חלק ה' – כללי עבודה

- **שינוי מבני ושינוי התנהגות לא נכנסים באותו PR.** העברה ל-service או ל-handler היא מכנית, ובדיקות שנכתבו לפני ההעברה חייבות לעבור אחריה בלי שינוי.
- **סדר בכל PR של refactor:** קודם בדיקות אפיון על הקוד הקיים, אחר כך העברה, אחר כך הוצאה מה-allowlist.
- כל באג שמתוקן מקבל בדיקת רגרסיה שנכשלת לפני התיקון.
- כל חוק חדש ב-`AGENTS.md` מגיע עם בדיקה ב-`src/test/architecture/`.
- קוד חדש נכתב מראש לפי ארכיטקטורת היעד: service, hook ו-UI, ו-Edge Function בתבנית handler.
- בסיום WP-3 ו-WP-4 מוסיפים ל-`AGENTS.md` את כללי התלות (חלק ב') ואת תבנית ה-handler.
