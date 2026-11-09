# תוכנית בדיקות יחידה (Unit Tests) – אימות ארכיטקטורה ובידוד מערכות

> מטרה: כל שכבה וכל תת-מערכת ב-tiful360 נבדקת **בפני עצמה**, בלי תלות ב-Supabase אמיתי, ברשת או בשכבות אחרות, ובנוסף נבדק שהגבולות בין השכבות נשמרים (חוקי `AGENTS.md`).

---

## 1. מצב קיים (נכון לנובמבר 2026)

| רכיב | היקף | כיסוי בדיקות היום |
|---|---|---|
| `src/lib` (לוגיקה טהורה) | 53 מודולים + `mcp/` | 27 מכוסים, **27 ללא בדיקה** |
| `src/hooks` (שכבת נתונים) | 40 hooks | 3 (`useOffboarding`, `useExpiringAssets`, `useCategories`) |
| `src/components` | 79 + 15 תיקיות תחום, 57 רכיבי `ui` | כ-15 רכיבים, בעיקר feedback / ui |
| `src/pages` | 28 מסכים | 0 ישירים |
| `supabase/functions` | 35 Edge Functions + `_shared` | 3 מודולי `_shared` בלבד |
| `supabase/migrations` | 160 מיגרציות, ~75 פונקציות DB, טריגרים, RLS | 0 |

תשתית: Vitest + jsdom + Testing Library, `src/test/setup.ts`, כל הבדיקות בתיקייה `src/test/`. דפוס ה-mock הקיים (`vi.hoisted` + `vi.mock("@/integrations/supabase/client")`) טוב ומשמש בסיס לתוכנית.

**מודולי `src/lib` ללא בדיקה:** `permissionGroups`, `permissionAudit`, `managedUsers`, `dualAccess`, `authErrors`, `serviceTickets`, `validateTax101`, `tax101Url`, `generateTax101Pdf`, `signLink`, `signedFormUpload`, `handoverUrl`, `handoverFields`, `handoverDraft`, `assetDomains`, `domainConfig`, `vehicleLinkedGroups`, `builtinFields`, `dashboardConfig`, `notificationCenter`, `googleCalendar`, `hebrewBirthday`, `lazyWithReload`, `videoCompress`, `webmcp-telemetry`, `categoryIcons`, `utils`.

---

## 2. עקרונות

1. **בידוד מלא** – כל בדיקה מחליפה את התלויות החיצוניות שלה (Supabase client, `fetch`, `Deno.env`, שעון, `crypto`) ב-fakes. אסור לבדיקת יחידה לפנות לרשת.
2. **שכבה אחת לכל בדיקה** – בדיקת hook לא מרנדרת מסך; בדיקת מסך מקבלת hooks מדומים.
3. **בדיקה לכל חוק ב-`AGENTS.md`** – כל חוק הוא אינווריאנט ארכיטקטוני וצריך לפחות בדיקה אחת שנכשלת אם החוק נשבר.
4. **בדיקות התנהגות, לא מימוש** – בודקים את החוזה (קלט → פלט / קריאה ל-RPC עם פרמטרים נכונים), לא פרטים פנימיים.
5. **מבנה תיקיות** – ממשיכים ב-`src/test/`, עם תתי-תיקיות לפי שכבה:
   ```
   src/test/
     architecture/   # בדיקות גבולות וחוקי AGENTS.md
     lib/            # שכבה 1
     hooks/          # שכבה 2
     components/     # שכבה 3
     pages/          # שכבה 4
     edge/           # שכבה 5 (מייבא מ-supabase/functions/_shared)
     helpers/        # fakes משותפים
   supabase/tests/   # שכבה 6 – pgTAP
   ```

---

## 3. שלב 0 – תשתית משותפת (דרישת קדם, ~2 ימים)

| פריט | תיאור |
|---|---|
| `helpers/supabaseFake.ts` | fake ל-Supabase client עם builder שרשרתי (`from().select().eq().order()…`), `rpc`, `functions.invoke`, `storage`, `auth`. רושם כל קריאה (טבלה, פילטרים, payload) כדי שאפשר יהיה לבדוק בדיוק מה נשלח. מחליף את ה-mocks המקומיים שחוזרים בכל קובץ (למשל ב-`ticketHandlingStatus.test.ts`). |
| `helpers/renderWithProviders.tsx` | רינדור עם `QueryClientProvider` (retry כבוי), `MemoryRouter`, `AuthContext` ו-`CompanyContext` מדומים עם פרמטרים: תפקידים, `isSuperAdmin`, `companyId`. |
| `helpers/factories.ts` | יצירת אובייקטים: employee, asset, ticket, company, permission group, payslip, leave request. |
| `helpers/clock.ts` | `vi.useFakeTimers` + `setSystemTime` לתאריכים, חגים ושעון נוכחות. |
| `vitest.config.ts` | להוסיף `coverage` (v8) עם `include: ["src/lib/**","src/hooks/**","supabase/functions/_shared/**"]` ו-thresholds מדורגים (ראו סעיף 10). להוסיף `supabase/functions/_shared/**/*.test.ts` ל-`include`. |
| CI | workflow ב-`.github/workflows/test.yml`: `bun install --frozen-lockfile` → `bun run lint` → `bun run test --coverage`. (לפי חוקי הפרויקט: Bun בלבד, אין `package-lock`.) |

---

## 4. שלב 1 – בדיקות ארכיטקטורה (גבולות בין מערכות)

אלה הבדיקות שמוודאות שכל מערכת **נשארת בתחום שלה**. רצות מהר, סטטיות, ונכשלות מיד כשמישהו עוקף את הארכיטקטורה.

| בדיקה | מה נבדק | חוק ב-AGENTS.md |
|---|---|---|
| `layering.test.ts` | `src/lib/**` לא מייבא מ-`components`/`pages`/`hooks`; `components/ui` לא מייבא hooks של נתונים; `pages` לא קוראים ל-`supabase.from` ישירות, אלא דרך hooks | הפרדת שכבות |
| `screenAccess.contract.test.ts` | כל route ב-`App.tsx`, כל פריט ב-`AppSidebar`, כל טאב ב-hub ו-`GlobalSearch` מקבלים את רשימת התפקידים מ-`screenAccess.ts` בלבד; URLs ישנים מפנים ל-`?tab=` | Screen and tab role lists |
| `noNativeDialogs.test.ts` | אין `window.confirm/prompt/alert` ב-`src/` | shared feedback components |
| `mcpReadOnly.test.ts` | ב-`src/lib/mcp/tools` אין `insert/update/delete/upsert/rpc` לכתיבה, ואין גישה לטבלאות שכר | App MCP read-only |
| `mesimonBoundary.test.ts` | רק `create-mesimon-task` מכיל את ה-URL של Mesimon; הפונקציה בודקת `MESIMON_COMPANY_IDS` | Mesimon single-tenant |
| `emailLayout.test.ts` | כל תבנית ב-`_shared/transactional-email-templates` עוטפת ב-`EmailLayout`; כל שליחת HTML עוברת `formatEmailHtml`; אין "default company" גלובלי | email-theme tokens |
| `spreadsheetAdapter.test.ts` | אף קובץ לא מייבא `xlsx` ישירות, רק דרך `@/lib/xlsx` (lazy) | spreadsheet adapter |
| `userRolesWrites.test.ts` | כתיבות ל-`user_roles` בקוד הקליינט ובפונקציות כוללות רק `super_admin`/`employee` | permission groups |
| `categoryFieldsCompany.test.ts` | אף insert/upsert ל-`category_fields` לא שולח `company_id` | category_fields trigger |
| `dependencySecurity.test.ts` (קיים) | להרחיב: אין `package-lock.json`, `patchedDependencies` קיים לכל patch | Bun only |

הטכניקה: סריקה סטטית בעזרת `import.meta.glob` / `fs` + regex או ניתוח AST קל (`@typescript-eslint/typescript-estree`, כבר זמין דרך eslint). דפוס דומה קיים כבר ב-`navigationMap.test.ts` וב-`agentIntegrations.test.ts`.

---

## 5. שלב 2 – שכבת הלוגיקה הטהורה (`src/lib`)

הכי זול והכי משתלם: פונקציות טהורות, בלי mocks. **יעד: 90% כיסוי שורות.**

עדיפות לפי סיכון:

| עדיפות | מודולים | מקרים חשובים |
|---|---|---|
| **P0 – הרשאות ואבטחה** | `permissionGroups`, `permissionAudit`, `managedUsers`, `dualAccess`, `screenAccess` (להרחיב), `oauth-return-path` (להרחיב), `authErrors` | union של קבוצות → תפקידים; super-admin bypass מול `strict`; open redirect (`//evil`, `https://other`, `javascript:`); הודעות שגיאה בעברית |
| **P0 – שכר ומס** | `validateTax101`, `tax101Url`, `generateTax101Pdf` (רק בניית הנתונים, לא הרינדור), `michpalExport` | ת"ז לא תקינה, שדות חובה, תאריכים גבוליים, קידוד עברית/RTL |
| **P1 – חתימות וקבצים** | `signLink`, `signedFormUpload`, `handoverUrl`, `handoverFields`, `handoverDraft`, `leaveAttachmentPath` | טוקן פג תוקף, נתיב storage מתחיל ב-company id, path traversal (`../`) |
| **P1 – נכסים** | `assetDomains`, `domainConfig`, `vehicleLinkedGroups`, `builtinFields`, `expiringResourceTargets` (להרחיב) | מיפוי דומיין → route, קיבוץ לפי זהות משאב, כמה תאריכי תפוגה למשאב אחד |
| **P2 – תצוגה ונוחות** | `dashboardConfig`, `notificationCenter`, `googleCalendar`, `hebrewBirthday`, `categoryIcons`, `utils`, `webmcp-telemetry` (fail-open), `lazyWithReload`, `videoCompress` | חגים ושנה מעוברת, fail-open של telemetry, reload חד-פעמי אחרי chunk error |

כל מודול: מקרה תקין, מקרי קצה (ריק / `null` / עברית / תאריך גבול), וקלט זדוני כשרלוונטי.

---

## 6. שלב 3 – שכבת הנתונים (`src/hooks`)

כל hook נבדק עם `supabaseFake` + `renderHook` בתוך `QueryClientProvider`. **יעד: כל hook שכותב נתונים נבדק.**

לכל hook בודקים:
1. **סינון לפי חברה** – כל `select` כולל `.eq("company_id", currentCompany)` (בידוד tenants).
2. **חוזה כתיבה** – ה-payload / פרמטרי ה-RPC המדויקים; אין שדות שהשרת אמור לקבוע (`actor`, `company_id` של `category_fields`).
3. **שגיאות** – שגיאת Supabase נזרקת ואין side-effect נוסף (כמו שכבר נבדק ב-`offboarding.test.ts`).
4. **Invalidation** – אילו query keys מתרעננים אחרי mutation.

סדר עבודה:

| גל | Hooks | למה |
|---|---|---|
| 1 | `usePermissionGroups`, `useAuth`, `useCompany`, `useMutations` | הרשאות ו-tenant, הבסיס לכל השאר |
| 2 | `usePayslips`, `useTax101`, `useOffboarding` (להרחיב), `useOnboarding`, `useOnboardingProtocol` | נתונים רגישים, תהליכים אטומיים |
| 3 | `useServiceTickets`, `useLeaveRequests`, `useAttendancePunches`, `useAttendanceCorrections`, `useCompanyHolidays` | תהליכים יומיומיים |
| 4 | `useCategories` (להרחיב – מחיקה לפי `group_id` בלבד), `useAssetGroups`, `useAssetDocuments`, `useExpiringAssets`, `useSites`, `useSubEmployers`, `useVehicleSubscriptions` | נכסים |
| 5 | השאר (`useDashboardPrefs`, `usePersistentFilter`, `useHubTab`, `useAnnouncements`, `usePortalLearning`…) | |

---

## 7. שלב 4 – רכיבים ומסכים

**רכיבים משותפים (`components/ui`, `components/feedback`)** – כל רכיב מה-design system נבדק בנפרד: נגישות (role, label, keyboard), מצבים (loading/empty/error ב-`StateView`), `useConfirm`, `undoToast`, `useDirtyGuard`, `FileDrop`, `IconButton` (חובת `aria-label`), `runBatch`.

**רכיבי תחום** – עם hooks מדומים (`vi.mock("@/hooks/…")`), בודקים רק לוגיקת UI:
- `ProtectedRoute`, `AppSidebar`, `SessionHomeRedirect`, `OAuthReturnRedirect` – לפי מטריצת תפקידים × מסכים (test.each על `screenAccess`).
- `OffboardingDialog`, `PayslipsUploadDialog`, `Tax101Dialog`, `QuickAssignDialog`, `TransferAssetDialog`, `NewITTicketDialog`, `TicketScreenshotButton` – ולידציה, כפתור שמירה, אישור לפני פעולה הרסנית.
- טבלאות נכסים – checkbox, מיון, כפתור פתיחה עם שמות נגישים (חוק טבלאות סמנטיות).

**מסכים (`pages`)** – smoke test לכל מסך: מרונדר עם providers מדומים, מציג את ה-StateView הנכון ל-loading/error/empty, ומסתיר טאבים לפי תפקיד. בלי לבדוק שוב לוגיקה שנבדקה בשכבות התחתונות.

---

## 8. שלב 5 – Edge Functions

הבעיה: רוב הלוגיקה כתובה ישירות בתוך `Deno.serve` ב-`index.ts`, ולכן אי אפשר לבדוק אותה בנפרד.

**הפתרון – Refactor מדורג לפי תבנית אחת:**
```ts
// supabase/functions/<name>/handler.ts – טהור, ניתן לבדיקה
export async function handle(req: Request, deps: { db: Client; env: Env; sendEmail: …; now: () => Date }) { … }
// supabase/functions/<name>/index.ts – רק wiring
Deno.serve((req) => handle(req, realDeps()));
```
לוגיקה משותפת עוברת ל-`_shared/` (כמו `ticket-handling-status.ts` שכבר נבדק מ-Vitest).

לכל פונקציה בודקים: CORS/OPTIONS, אימות (ללא JWT → 401), הרשאה (תפקיד לא מתאים → 403), בידוד חברה, ולידציית קלט, ונתיב הצלחה.

| עדיפות | פונקציות | אינווריאנטים קריטיים |
|---|---|---|
| P0 | `manage-users` | כותבת שורת `permission_audit_log` עם המבצע האמיתי; לא ניתן לנהל משתמשים של חברה אחרת |
| P0 | `split-payslips` (876 שורות) | upsert לפי עובד+תקופה; **אין מחיקה גורפת של תקופה**; העלאה חלקית לא מוחקת תלושים של אחרים; שיוך לפי ת"ז שלא נמצאה |
| P0 | `create-mesimon-task`, `it-api` | חברה שלא ב-`MESIMON_COMPANY_IDS` → נדחית; סגירה חוזרת שולחת מייל לפותח |
| P0 | `mcp`, `list-companies-for-agent` | read-only, client לפי caller, בדיקת access-block |
| P1 | `reply-it-ticket`, `notify-it-ticket` | שימוש ב-`markTicketInProgress` עם עדכון מותנה ב-`status=open` |
| P1 | `ingest-attendance-punch`, `ingest-attendance-heartbeat` | אימות מכשיר, כפילויות, אזור זמן |
| P1 | `sign-form-upload-url`, `tax-form-101-signed-url`, `send-handover-sign-link` | תוקף טוקן, נתיב לפי חברה |
| P2 | כל פונקציות ה-`send-*` / `notify-*` | resolve brand מהחברה המפעילה, `formatEmailHtml`, נמענים נכונים |
| P2 | `ai-assistant` (1,326 שורות) | פיצול ל-tools נפרדים, כל tool נבדק עם הרשאות |

מודולי `_shared` שעדיין לא נבדקו: `email-brand`, `email-html`, `enqueueEmail`, `send-email-logged` (`htmlToText`), `formatDate`.

---

## 9. שלב 6 – מסד הנתונים (RLS, טריגרים, פונקציות)

חלק גדול מהארכיטקטורה נאכף ב-DB, ולכן בלי בדיקות כאן אין אימות אמיתי של הבידוד. משתמשים ב-**pgTAP** דרך `supabase test db` (DB מקומי, עדיין בדיקה מבודדת של כל פונקציה בנפרד).

| קובץ | מה נבדק |
|---|---|
| `rls_tenant_isolation.sql` | לכל טבלה עם `company_id`: משתמש מחברה A לא קורא ולא כותב שורות של חברה B |
| `permission_groups.sql` | חברה חדשה מקבלת קבוצות ברירת מחדל (trigger); `user_roles` נגזר כ-union |
| `permission_audit_log.sql` | כתיבה ישירה נרשמת; אין `UPDATE`/`DELETE` ליומן (append-only) |
| `category_fields_company.sql` | `company_id` נקבע מהקטגוריה גם אם הקליינט שלח ערך אחר |
| `start_employee_offboarding.sql` | אטומי (כשל באמצע → rollback מלא); בודק tenant; פעילות נחתמת עם המבצע ו-snapshot של השם |
| `payroll_privacy.sql` | תלושים גלויים רק לעובד עצמו ולתפקיד payroll של אותה חברה |

---

## 10. יעדי כיסוי ולוח זמנים

| שלב | משך משוער | יעד כיסוי (thresholds ב-CI) |
|---|---|---|
| 0 – תשתית + CI | שבוע 1 | – |
| 1 – בדיקות ארכיטקטורה | שבוע 1–2 | כל חוקי `AGENTS.md` מכוסים |
| 2 – `src/lib` | שבוע 2–3 | `src/lib` ≥ 90% |
| 3 – hooks | שבוע 3–5 | `src/hooks` ≥ 70% |
| 5 – Edge Functions P0 + refactor | שבוע 4–6 | `_shared` ≥ 85%, כל P0 עם handler נבדק |
| 6 – pgTAP | שבוע 5–6 | כל טבלה עם `company_id` בבדיקת RLS |
| 4 – רכיבים ומסכים | שבוע 6–8 | כל רכיב ב-`ui`/`feedback` + smoke לכל מסך |

ה-thresholds עולים בהדרגה (מתחילים מהכיסוי הנוכחי ומעלים בכל שלב) כדי שה-CI לא ייחסם ביום הראשון.

---

## 11. כללי עבודה שוטפים

- כל באג שמתוקן מקבל בדיקת רגרסיה שנכשלת לפני התיקון (כמו `categoryFieldsScope.test.ts`).
- כל חוק חדש ב-`AGENTS.md` מגיע עם בדיקה ב-`src/test/architecture/`.
- כל Edge Function חדשה נכתבת מראש בתבנית `handler.ts` + `index.ts`.
- PR שמוריד את הכיסוי מתחת ל-threshold נחסם ב-CI.
