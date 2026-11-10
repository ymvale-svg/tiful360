# Design System Master File — תפעול 360

> **LOGIC:** When building a specific page, first check `design-system/tiful360/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. If not, follow the rules below.

Generated with the ui-ux-pro-max skill (`--design-system --density 8 --variance 3 --motion 2 --persist`)
and then corrected for this product. The skill's raw output picked an unrelated category
(IoT dashboard), Latin-only fonts (Fira, no Hebrew glyphs), a dark green palette and a marketing
landing pattern; those parts are replaced below. Its style, density, anti-patterns and checklist
are kept.

**Product:** internal HR / operations admin (staff) + employee portal (phones). Hebrew, RTL.
**Stack:** React 18 + shadcn/ui + Tailwind 3 + TanStack Query. Tokens live in `src/index.css`.
**Dials:** Variance 3/10 (calm, minimal) · Motion 2/10 (subtle) · Density 8/10 (dense work screens)

---

## Style

Minimalism & Swiss Style: clean, grid-based, high contrast, essential. Colour appears only when it
means something; numbers are the loudest thing on a work screen.

- Border, fill and shadow only for real objects (dialog, sheet, employee card). Lists and tables sit
  on the background with dividers.
- One status chip everywhere: icon + word + soft tint. Rows get a thin severity bar on the start edge.
- Empty states: line icon in the brand colour, a sentence saying why it's empty, one next action.

## Colour (existing tokens — do not hard-code hex)

| Role | Token |
|------|-------|
| Brand / primary action | `--primary` |
| Critical | `--destructive` |
| Warning | `--warning` |
| OK / done | `--success` |
| Info | `--info` |
| Quiet surface | `--muted` / `--muted-foreground` |
| Sidebar | `--sidebar-*` (dark in both themes) |

Status colour is never the only signal: always pair it with text or an icon. Light and dark themes
both keep 4.5:1 text contrast.

## Typography

| Role | Face | Size |
|------|------|------|
| Body, nav, buttons, forms, tables | Heebo 400/500 | 14–16px, never below 12px |
| Page and section titles | Almoni Neue DemiBold *(needs an AAA webfont licence; Heebo 700 until then)* | 20–34px |
| KPI numbers, clock | Almoni Tzar Bold *(same licence note)* | 28–46px, `tabular-nums` |

Numbers that line up use `tabular-nums`. Dates use `he-IL` formatting.

## Spacing & targets

Dense scale (Tailwind): 2 · 4 · 8 · 12 · 16 · 24 · 32px. Touch targets ≥44px on `pointer: coarse`
(Button does this automatically), ≥40px elsewhere, 8px between adjacent targets.

## Motion

150–250ms colour/opacity transitions; press feedback `scale(.98)`. Motion (the `motion` package)
only where it carries meaning: a number rolling to a new value, a row leaving a queue, the active-tab
indicator. Everything respects `prefers-reduced-motion`. No scroll-reveal choreography on work screens.

## Shared components (use these, don't re-invent)

| Need | Component |
|------|-----------|
| Confirm before delete / irreversible action | `useConfirm()` — `components/feedback/ConfirmDialog` |
| Instant action that can be reverted | `undoToast()` |
| Field with label, hint, inline error | `FormField`, `focusFirstInvalid()` |
| Don't lose a half-filled form | `useDirtyGuard(isDirty, isSaving)` |
| Loading → error → empty → content | `StateView`, `EmptyState`, `ListSkeleton` |
| Icon-only button | `IconButton label="…"` |
| File picking / dropping | `FileDrop` |
| Long multi-row work | `runBatch()` (progress center "שורה i מתוך N") |
| Uploads | `uploadFile()` (progress donut) |
| Saves | `Button` busy state + global `SaveProgressBar` (automatic) |
| KPI with link to its list | `KpiTile` |

## App shell pattern

Sidebar in five fixed areas (ראשי, אנשים, משאבים, שירות ותקשורת, ניהול) + פורטל; roles hide items,
never move them; counters carry context for screen readers. Header: search palette (Ctrl+K), company,
portal switch, theme, notification center, user. Every tab and filter is reflected in the URL and Back
returns to it. Employee portal on phones: bottom tab bar of five (בית, נוכחות, בקשות, ידע, עוד).

---

## Anti-Patterns (Do NOT Use)

- ❌ `window.confirm` / `window.prompt` / `window.alert` (ESLint blocks them)
- ❌ "לא נמצאו…" while data is still loading or failed to load
- ❌ Success toast for something that wasn't saved
- ❌ Colour-only status, emoji as icons, text under 12px
- ❌ Clickable `div`/`tr` without keyboard support; interactive elements nested in each other
- ❌ Controls that appear only on hover (phones never hover)
- ❌ Instant destructive changes from a select/menu without confirm or undo
- ❌ Invisible focus states; layout-shifting hovers

## Pre-Delivery Checklist

- [ ] Every control has an accessible name; keyboard reaches and operates everything
- [ ] Saves show progress and success; failures say what to do; irreversible actions confirm
- [ ] Loading, error and empty states are distinct; empty states offer the next action
- [ ] Forms keep input on close (dirty guard) and show errors next to fields
- [ ] 44px targets on touch, no horizontal scroll at 375px, nothing hidden under fixed bars
- [ ] Status uses text or icon as well as colour; contrast 4.5:1 in light and dark
- [ ] `prefers-reduced-motion` respected; transitions 150–250ms
- [ ] Tabs and filters in the URL; Back behaves
