# Production Priority Board — UX Standards Discovery & Consolidation

**Scope:** Current implementation of `artifacts/production-priority-board`, inspected September 23, 2026. This is an inventory of observed code, **not** a redesign or an adopted enterprise standard. API and workbook code are considered only where they drive visible behavior. Paths below are relative to `artifacts/production-priority-board/` unless otherwise specified. File references are evidence; generated component availability alone is not evidence of use.

**Classification key:** **STANDARD** = reusable convention demonstrably implemented; **CANDIDATE STANDARD** = potentially reusable, pending review; **APPLICATION-SPECIFIC** = tied to this production workflow; **INCONSISTENT** = competing treatments; **UNKNOWN** = intent or implementation not established. “Candidate” does not authorize adoption without accessibility and cross-app review.

## Relevant file tree

```text
artifacts/production-priority-board/
├── index.html
├── package.json
├── vite.config.ts
├── components.json
├── public/
│   ├── favicon.svg
│   ├── data/production-workbook.json
│   └── documents/                    # generated review/dataflow HTML
├── scripts/generate-documents.ts
└── src/
    ├── main.tsx                       # root ErrorBoundary
    ├── App.tsx                        # providers, auth gate, routing, toaster
    ├── index.css                      # Tailwind mapping and dark palette
    ├── pages/
    │   ├── Dashboard.tsx              # shell, selectors, KPIs, grid, search
    │   └── not-found.tsx
    ├── components/
    │   ├── LoginGate.tsx              # authentication states
    │   ├── OrderDetailsDialog.tsx     # right-side Sheet and sales lines
    │   ├── error-boundary.tsx
    │   └── ui/
    │       ├── badge.tsx              # used
    │       ├── input.tsx              # used
    │       ├── sheet.tsx              # used
    │       ├── table.tsx              # used
    │       ├── toaster.tsx            # mounted, no board toast calls found
    │       ├── tooltip.tsx            # used by WO Qty header
    │       ├── button.tsx             # available, NOT used by dashboard
    │       ├── dialog.tsx             # available, NOT used by detail panel
    │       └── ...                    # other available UI primitives, not
    │                                  # evidence of implemented board patterns
    ├── hooks/
    │   ├── use-auth.tsx
    │   ├── use-production-data.ts     # query, scoped filters, KPI sums
    │   └── use-toast.ts
    └── lib/
        ├── production-grid.ts        # column filtering/sorting
        ├── export-production-grid.ts # Excel download
        ├── date-utils.ts
        └── mock-data.ts              # order shape and legacy workbook data
docs/
└── production-priority-board-ux-standards-discovery.md
```

## 1. Application shell

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Frame and hierarchy | Auth-gated, dark single-page board; route `/` renders Dashboard, other routes NotFound. Query, tooltip and toast providers wrap it. | `src/App.tsx:19-49`; `src/components/LoginGate.tsx:5-12` | APPLICATION-SPECIFIC shell; CANDIDATE STANDARD auth gating |
| Header/identity | Full-width header with small green mark, board title, signed-in user/role and Sign out; no separate brand logo asset in the header. | `src/pages/Dashboard.tsx:386-418`; `public/favicon.svg` | APPLICATION-SPECIFIC |
| Global navigation | No active sidebar, tabs, breadcrumbs, global search, help, notification center or settings UI. Available `ui/sidebar.tsx`/`ui/breadcrumb.tsx` do not imply use. | `src/App.tsx:19-27`; `src/pages/Dashboard.tsx:386-418` | UNKNOWN for enterprise navigation |
| Responsive shell | Header reflows at `xl`; content area adjusts horizontal padding at `md`. | `src/pages/Dashboard.tsx:386-420` | CANDIDATE STANDARD |

## 2. Layout

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Content frame | Centered main max width `1800px`, `px-4` and `md:px-6`, `py-4`; stacked selector/summary/grid sections use `mb-4`, `gap-2` and `gap-4`. | `src/pages/Dashboard.tsx:420-436,531-608` | CANDIDATE STANDARD for spacing; APPLICATION-SPECIFIC for width/density |
| Selector and KPI arrangement | Group/team buttons wrap; KPI/search/export strip retains one wide row with horizontal overflow (`min-w-max`). | `src/pages/Dashboard.tsx:436-529,531-605` | APPLICATION-SPECIFIC |
| Table responsiveness | Main grid has `min-w-[1370px]` and scrolls horizontally rather than collapsing columns. Sheet is `w-full` on small screens, `sm:max-w-6xl`; detail lines also scroll. | `src/pages/Dashboard.tsx:607-625`; `src/components/OrderDetailsDialog.tsx:21-25,95-96` | APPLICATION-SPECIFIC |
| Surfaces | Bordered, translucent card panels with compact radii; metadata inside the Sheet uses one/two columns at `sm`. | `src/pages/Dashboard.tsx:531,608`; `src/components/OrderDetailsDialog.tsx:41-43` | CANDIDATE STANDARD |

## 3. Typography

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Font stack | Sans and “mono” both point to Aptos, Segoe UI, Arial, sans-serif; `font-mono` classes do **not** currently produce a monospaced typeface. | `src/index.css:51-53,96-98` | INCONSISTENT naming vs rendering |
| Hierarchy | Header title and KPI values are bold; section labels use uppercase, letterspacing and compact sizes (`9–12px`); grid uses small text with larger priority/work order emphasis. | `src/pages/Dashboard.tsx:104-133,387-405,436-443,610-660` | CANDIDATE STANDARD for hierarchy; APPLICATION-SPECIFIC for cockpit density |
| Helper/truncation | Muted secondary descriptions; long detail values truncate with native `title` on some fields. | `src/components/OrderDetailsDialog.tsx:36-38,69,118-125` | CANDIDATE STANDARD, pending accessible disclosure review |

## 4. Color

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Dark foundation | `--background: 164 100% 8%` (commented `#00281D`), foreground `#FFFFFF`; card/popover `164 80% 10%`; border `164 50% 15%`. Dark and root share values; no distinct light theme defined here. | `src/index.css:61-76` | CANDIDATE STANDARD palette, pending contrast testing |
| Primary and subdued | Primary/ring `77 100% 50%` (`#B7FF00`); muted foreground `108 16% 78%` (`#C2D2BE`); secondary `164 50% 15%`. | `src/index.css:68,78-88` | CANDIDATE STANDARD palette |
| Warning/error | Warning `35 100% 50%` (commented `#FFB000`), destructive `0 100% 60%` (commented `#FF3333`); runtime error sections use red utility classes. | `src/index.css:90-94`; `src/pages/Dashboard.tsx:421-433`; `src/components/LoginGate.tsx:41-44` | CANDIDATE STANDARD; not a complete severity specification |
| Informational/success/selection | Started status uses primary green; Released uses sky blue; overdue uses red; selected KPI and selector buttons use filled primary with dark text; disabled export uses opacity. No explicit `--color-info` or `--color-success` semantic token defined. | `src/pages/Dashboard.tsx:56-60,101-115,452-475,595-599`; `src/index.css:12-49` | APPLICATION-SPECIFIC status semantics; CANDIDATE STANDARD selected treatment |
| Direct colors | Dark text `#00281D`, grid header `#07392b`, and red/sky/amber utility shades appear alongside theme tokens. | `src/pages/Dashboard.tsx:115,454,611,697`; `src/index.css:61-107` | INCONSISTENT token use |

## 5. Buttons and actions

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Primary action | Green filled Export to Excel and Microsoft sign-in; export becomes disabled when empty/busy and says “Exporting…”. | `src/pages/Dashboard.tsx:593-602`; `src/components/LoginGate.tsx:47-55` | CANDIDATE STANDARD for action prominence |
| Secondary/filters | Outlined Sign out/Clear filters/Retry; filled green selected group/team/KPI, outlined inactive. Several are local raw `<button>`s rather than shared `Button`. | `src/pages/Dashboard.tsx:89-134,407-415,444-527,582-591`; `src/components/LoginGate.tsx:57-65` | INCONSISTENT component source; APPLICATION-SPECIFIC selector semantics |
| Icon actions/destructive/confirmation | Sort and close-filter icon buttons have `aria-label`; Sign out is a form POST. No destructive action or confirmation flow implemented in the board. | `src/pages/Dashboard.tsx:309-317,371-379,407-415` | CANDIDATE STANDARD for icon labels; UNKNOWN for destructive conventions |
| Available button system | `Button` defines default/destructive/outline/secondary/ghost/link and sizes, but is not used in Dashboard or LoginGate. Do not treat all variants as adopted UX. | `src/components/ui/button.tsx:6-56`; `src/pages/Dashboard.tsx:89-134` | UNKNOWN as enterprise standard |

## 6. Forms

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Inputs | Search field and dynamic column text/date filters use shared `Input`; date fields are labeled From/To, text filters have `aria-label` and autofocus. Filter close button closes editor, not the applied filter. | `src/pages/Dashboard.tsx:319-381,571-580`; `src/components/ui/input.tsx` | CANDIDATE STANDARD column-filter controls |
| Data entry/validation | This is a read/filter/export board, not an editable form: no save/cancel, required markers, multiline entry, form validation, unsaved-change logic or data-entry confirmation is implemented. | `src/pages/Dashboard.tsx:137-264,319-381`; `src/components/OrderDetailsDialog.tsx:12-19` | UNKNOWN |
| Search label | Search uses placeholder “WO, SO, customer” without a visible label or `aria-label`; date/text filter fields have labels. | `src/pages/Dashboard.tsx:571-580,323-368` | INCONSISTENT accessibility |

## 7. Tables and data grids

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Dense production grid | 11-column scrollable table, compact rows, sticky dark header, grid priority and semantic status badge; WO Qty displays remaining / scheduled with muted denominator. | `src/pages/Dashboard.tsx:607-710` | APPLICATION-SPECIFIC schema; CANDIDATE STANDARD table density |
| Sort/filter | Each grid header has filter and sort buttons; text contains-match, date ranges, numerical WO Qty sort; active filters show a dot. Sorting initially priority ascending; no pagination. | `src/pages/Dashboard.tsx:168-171,276-383`; `src/lib/production-grid.ts:94-143` | CANDIDATE STANDARD controls; APPLICATION-SPECIFIC defaults |
| Row details and empty | Clicking a row opens right-side Sheet; empty result is a single full-width message. No row checkbox/selection or expandable rows. | `src/pages/Dashboard.tsx:626-645,714-719` | APPLICATION-SPECIFIC details; CANDIDATE STANDARD empty message |
| Export | Excel export uses the currently visible filtered/sorted rows, has two separate WO quantity columns, a frozen header, autofilter and date formatting. | `src/pages/Dashboard.tsx:207-219,256-264,593-602`; `src/lib/export-production-grid.ts:10-94` | CANDIDATE STANDARD for matching exported view |
| Table variants | Main grid uses `ui/table.tsx`; detail uses a native nine-column table. Neither has a caption/accessible table name in current use. | `src/pages/Dashboard.tsx:607-625`; `src/components/OrderDetailsDialog.tsx:95-142` | INCONSISTENT presentation; accessibility review needed |

## 8. Status and state

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| STARTED / RELEASED | Queue badges use green-ish primary for STARTED and sky for RELEASED; fallback muted. Detail header uses a muted outline badge even for those statuses. | `src/pages/Dashboard.tsx:56-60,692-702`; `src/components/OrderDetailsDialog.tsx:27-35` | INCONSISTENT within app; APPLICATION-SPECIFIC labels |
| Past due / hold | Build/ship past-due dates receive red emphasis; a HOLD exception can be derived from source stage/resource, but there is no general “On Hold” badge scheme in the rendered grid. | `src/pages/Dashboard.tsx:615-625,665-695`; `artifacts/api-server/src/routes/production-priority.ts:431-443` | APPLICATION-SPECIFIC |
| Other state vocabulary | No general visual mapping for Inactive, Draft, Pending, Complete, Failed, Warning, Error, New, In Progress, Archived. Error alerts exist but are not status badges. | `src/pages/Dashboard.tsx:56-60,421-434`; `src/components/LoginGate.tsx:27-45` | UNKNOWN; do not infer from unused badge variants |

## 9. Notifications and feedback

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Inline feedback | Login loading uses spinner with `role=status`; login/API failure uses bordered red `role=alert`; board loading uses green inline section. | `src/components/LoginGate.tsx:27-45`; `src/pages/Dashboard.tsx:421-434` | CANDIDATE STANDARD alert placement; INCONSISTENT loading semantics |
| Toasts | Toaster is mounted globally and toast utilities exist, but no Dashboard action calls `toast`; no demonstrated success-message duration or dismiss policy for this board. | `src/App.tsx:35-46`; `src/hooks/use-toast.ts`; `src/pages/Dashboard.tsx:256-264` | UNKNOWN |
| Export feedback | Export is disabled and renamed while in progress; failures are not surfaced by `handleExport` (only `finally` resets loading). | `src/pages/Dashboard.tsx:256-264,593-602` | CANDIDATE STANDARD progress label; incomplete error feedback |

## 10. Dialogs and modals

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Work-order detail | `OrderDetailsDialog` renders a right-side Radix-backed `Sheet`, controlled by `order` and `onClose`, title and description, overlay/close action, full viewport width on mobile. | `src/components/OrderDetailsDialog.tsx:12-39,145-149`; `src/components/ui/sheet.tsx` | CANDIDATE STANDARD drawer mechanics; APPLICATION-SPECIFIC content |
| Confirmation/multi-step | No implemented confirmation, destructive dialog or multi-step modal flow. `ui/dialog.tsx` / `ui/alert-dialog.tsx` being present is insufficient evidence. | `src/components/OrderDetailsDialog.tsx:12-149`; `src/components/ui/dialog.tsx` | UNKNOWN |

## 11. Navigation and interaction

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Page navigation | Single dashboard route plus NotFound; no active links, breadcrumbs, tabs, accordions or drawer navigation. Detail Sheet is contextual rather than route navigation. | `src/App.tsx:19-27`; `src/components/OrderDetailsDialog.tsx:21-39` | APPLICATION-SPECIFIC |
| Multi-select | Ctrl/Cmd-click adds/removes classification selections; plain click replaces selection; “All” clears. Selection persists per session. Hint is only native `title` on team/group buttons. | `src/pages/Dashboard.tsx:174-185,444-527`; `src/hooks/use-production-data.ts:236-268` | APPLICATION-SPECIFIC interaction; candidate for discoverability review |
| Hover/keyboard | Buttons change color on hover; selected KPI has focus-visible ring. WO Qty tooltip “Remaining/Planned” is on header label only. Row click opens details but row has no focus/keyboard activation. | `src/pages/Dashboard.tsx:89-134,276-317,638-645`; `src/components/ui/tooltip.tsx` | INCONSISTENT keyboard access |

## 12. Loading, empty and error states

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Loading | Login spinner and board inline “Loading live Azure PostgreSQL production data…”; no skeleton/progress bar in the active board. | `src/components/LoginGate.tsx:27-34`; `src/pages/Dashboard.tsx:430-434` | CANDIDATE STANDARD text feedback; UNKNOWN for global loading standard |
| Empty | “No active work orders match the current view.” in a table cell; sales lines have separate “No sales order lines available.” paragraph. No reset action inside either. | `src/pages/Dashboard.tsx:626-632`; `src/components/OrderDetailsDialog.tsx:88-94` | INCONSISTENT surfaces; APPLICATION-SPECIFIC copy |
| Error/recovery | API error is visible but has no retry action in Dashboard; LoginGate has Retry. Global ErrorBoundary provides generic fallback and development-only details. | `src/pages/Dashboard.tsx:421-428`; `src/components/LoginGate.tsx:41-65`; `src/components/error-boundary.tsx:38-64` | INCONSISTENT recovery |

## 13. Search and filtering

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Search | Queue-toolbar search filters WO/SO/customer case-insensitively; it does not search every column. | `src/pages/Dashboard.tsx:571-580`; `src/hooks/use-production-data.ts:324-333` | APPLICATION-SPECIFIC search fields; CANDIDATE STANDARD placement |
| Group/team and KPI | Group/team selection scopes the queue and KPIs; status/past-due KPIs are filter buttons with pressed state, not just metric cards. | `src/pages/Dashboard.tsx:137-219,436-563`; `src/hooks/use-production-data.ts:365-381` | APPLICATION-SPECIFIC filter semantics |
| Column filters | Per-column text/date editors; Clear filters resets column/date filters only, not search or classification/KPI filters. No filter chips or saved cross-session presets. Group/team selection is session-persisted. | `src/pages/Dashboard.tsx:220-243,276-383,582-591`; `src/hooks/use-production-data.ts:236-268` | CANDIDATE STANDARD per-column controls; APPLICATION-SPECIFIC clear scope |
| Result feedback | Toolbar shows visible remaining units versus base queue remaining units; not a row-count/pagination display. | `src/pages/Dashboard.tsx:218-219,564-569` | APPLICATION-SPECIFIC units |

## 14. Accessibility — observed, not certified

| UX pattern | Current implementation | Evidence | Classification |
|---|---|---|---|
| Positive semantics | `<header>`, `<main>`, named selector sections, real buttons with `aria-pressed`, labeled sort/filter controls, alerts, Radix-backed Sheet title/description and close behavior. | `src/pages/Dashboard.tsx:89-115,276-383,386-420,436-529`; `src/components/OrderDetailsDialog.tsx:21-39` | CANDIDATE STANDARD |
| Keyboard gap | Clickable table `<tr>` has no keyboard activation or focus target. Ctrl/Cmd multi-select has no visible in-page instructions. | `src/pages/Dashboard.tsx:444-527,638-645` | INCONSISTENT |
| Naming gap | Search lacks label/aria-label; tables have no caption or accessible name; WO Qty tooltip text is not a replacement for an accessible quantity description. | `src/pages/Dashboard.tsx:571-580,607-625`; `src/components/OrderDetailsDialog.tsx:95-108` | INCONSISTENT |
| Contrast | Tokens and colors are documented above, but no measured contrast audit is present; do not claim WCAG compliance based on source colors. | `src/index.css:61-107`; `src/pages/Dashboard.tsx:56-60` | UNKNOWN |

## Reusable component inventory

“Reuse potential” is an evaluation, not a decision to promote the current implementation unchanged.

| Current component | Purpose and current behavior | Props/variants and dependencies | Reuse potential / classification |
|---|---|---|---|
| `Kpi` (local to Dashboard) | Compact quantity card that toggles a queue filter, selected fill and focus ring. | `label`, `value`, `tone` (`default/good/warning/danger`), `filter`, `selected`, `onSelect`; Lucide Filter and `cn`. `src/pages/Dashboard.tsx:89-135` | Medium: separate metric/button mechanics from production statuses. CANDIDATE STANDARD |
| `sortableHead` (local renderer) | Filter/editor and sort controls for grid column, indicator dot. | `(column, label, className, placeholder)` plus local state; `Input`, Lucide sort/close. `src/pages/Dashboard.tsx:276-383` | Medium: extract with accessibility fixes and data-agnostic column model. CANDIDATE STANDARD |
| `Table` primitives | Semantic wrappers for main table with styling/overflow. | HTML table element props/ref/className; `cn`. `src/components/ui/table.tsx`; `src/pages/Dashboard.tsx:607-625` | High as primitive, but detail table uses native HTML. INCONSISTENT use |
| `Input` | Search and filter controls; native input with common visual treatment. | Native input props/type/ref/className; `cn`. `src/components/ui/input.tsx`; `src/pages/Dashboard.tsx:319-369,571-580` | High, if labels are supplied by consumers. STANDARD primitive in current app |
| `Badge` | Queue and detail status labels, different consumer styles. | `variant` (`default/secondary/destructive/warning/outline`), HTML div props/className; CVA. `src/components/ui/badge.tsx`; `src/components/OrderDetailsDialog.tsx:32-34` | High primitive; status mapping requires human decision. INCONSISTENT use |
| `Sheet` + `OrderDetailsDialog` | Right contextual detail overlay, close and title/description semantics. | `SheetContent` `side` top/bottom/left/right; `OrderDetailsDialog` `order`, `onClose`; Radix Dialog. `src/components/ui/sheet.tsx`; `src/components/OrderDetailsDialog.tsx:12-39` | High for Sheet mechanics, low for business-specific content. CANDIDATE STANDARD / APPLICATION-SPECIFIC |
| `Tooltip` | Header-only explanation for WO Qty. | Trigger/content/provider; Radix Tooltip. `src/App.tsx:39`; `src/pages/Dashboard.tsx:79-86,292-298` | High as primitive; exact copy is local. CANDIDATE STANDARD |
| `LoginGate` | Secure-access splash with loading, Microsoft login, error/retry. | `children`; auth hook and Lucide. `src/components/LoginGate.tsx:5-73` | Medium layout pattern; Microsoft/Admin Console policy is local. CANDIDATE STANDARD / APPLICATION-SPECIFIC |
| `Toaster` | Mounted toast viewport, no board calls. | Toast hook/provider components. `src/App.tsx:45`; `src/components/ui/toaster.tsx`; `src/hooks/use-toast.ts` | Not yet evidence for toast UX. UNKNOWN |
| `Button` | Available generic variant/size primitive; not used in board action controls. | `variant`, `size`, `asChild`, native button props; Radix Slot/CVA. `src/components/ui/button.tsx:6-56` | Potential reusable code, **not an implemented board button standard**. UNKNOWN |

No implemented `AppShell`, `PageHeader`, `Breadcrumbs`, `StatusBadge` abstraction, generic `DataTable`, `FilterBar`, `FormSection`, confirmation dialog, tabs or pagination should be inferred solely from the presence of UI component files.

## Design-token extraction

These are **existing tokens and values**, not a proposed rename to `--color-surface`/`--space-md`. HSL triples are consumed through Tailwind `hsl(var(...))`. Hex is given only where explicit in code comments or classes.

| Family | Existing implementation | Evidence / classification |
|---|---|---|
| Background/text | `--background: 164 100% 8%` (`#00281D`); `--foreground: 0 0% 100%` (`#FFFFFF`); `--card: 164 80% 10%`; `--popover: 164 80% 10%` | `src/index.css:61-76` — CANDIDATE STANDARD |
| Brand/secondary | `--primary: 77 100% 50%` (`#B7FF00`); `--primary-foreground: 164 100% 8%`; `--secondary: 164 50% 15%` | `src/index.css:78-82` — CANDIDATE STANDARD |
| Muted/border | `--muted: 164 50% 12%`; `--muted-foreground: 108 16% 78%` (`#C2D2BE`); `--border` and `--input: 164 50% 15%` | `src/index.css:66-67,84-85` — CANDIDATE STANDARD |
| Severity | `--destructive: 0 100% 60%` (`#FF3333`); `--warning: 35 100% 50%` (commented `#FFB000`); no explicit success/info semantic tokens | `src/index.css:90-94` — incomplete CANDIDATE STANDARD |
| Font | `--app-font-sans` and `--app-font-mono`: Aptos, Segoe UI, Arial, sans-serif; Tailwind `--font-sans`/`--font-mono` map to them. Sizes/weights applied per utility class, not app-specific CSS variables. | `src/index.css:51-53,96-98`; `src/pages/Dashboard.tsx:104-133` — INCONSISTENT “mono” naming |
| Spacing | Tailwind classes such as `gap-2`, `gap-4`, `p-3`, `p-4`, `md:p-6`, `mb-4`; no custom `--space-*` tokens. | `src/pages/Dashboard.tsx:420-436,531-608` — CANDIDATE STANDARD scale |
| Radii | `--radius: 0.125rem`; derived `--radius-sm/md/lg/xl`; consumers also use `rounded-sm`/`rounded-md`. | `src/index.css:55-59,99`; `src/components/OrderDetailsDialog.tsx:81-95` — CANDIDATE STANDARD |
| Elevation | `--elevate-1/2` translucent whites; selected KPI/group glow and login `shadow-2xl` are inline utilities; no named elevation-level spec. | `src/index.css:101-106`; `src/pages/Dashboard.tsx:101-115,452-475`; `src/components/LoginGate.tsx:12` — UNKNOWN shared scale |

No supported evidence for app-defined `--font-size-*`, `--font-weight-*`, `--space-*`, `--color-success`, or `--color-info` variables. Tailwind's general utilities must not be mistaken for decisions unique to this application.

## Inconsistencies requiring human review

| Pattern | Implementation A | Implementation B | Likely intended direction (hypothesis, not adopted) | Review question |
|---|---|---|---|---|
| Button system | Local raw buttons on board/sign-in (`Dashboard.tsx:89-134,444-527`; `LoginGate.tsx:48-65`) | Available CVA `Button` with its own radius/focus/size conventions (`ui/button.tsx:6-56`) | Common action hierarchy with shared focus/disabled semantics | Keep custom board density or align library primitive to it? |
| Status appearance | Green/blue queue badges (`Dashboard.tsx:56-60,692-702`) | Muted outline detail/line badges (`OrderDetailsDialog.tsx:32-34,130-134`) | Consistent status meaning, with separate line statuses if semantically different | Should Work Order status colors persist into detail? |
| Table styling | Main grid uses `ui/table.tsx` and sticky header (`Dashboard.tsx:607-625`) | Native, differently styled sales-line table (`OrderDetailsDialog.tsx:95-142`) | Shared base table semantics with density variants | Which parts should be shared without losing detail context? |
| Error recovery | Auth error has Retry (`LoginGate.tsx:41-65`) | API error banner has no retry (`Dashboard.tsx:421-428`) | Visible recovery path for transient failures | Should board expose existing refresh hook to users? |
| Empty states | Main grid uses table-cell message (`Dashboard.tsx:626-632`) | Detail lines use a bordered paragraph (`OrderDetailsDialog.tsx:88-94`) | Shared empty-state semantics, contextual presentation | What copy/action belongs in each context? |
| Accessible inputs | Column/date filters labeled (`Dashboard.tsx:319-369`) | Search placeholder only (`Dashboard.tsx:571-580`) | Every input has an accessible name | What short visible/visually hidden search label is appropriate? |
| KPI/query semantics | “Build date past due” sums build-end overdue (`use-production-data.ts:365-381`) | Clicking “Past Due” includes overdue build **or ship** (`use-production-data.ts:335-340`) | Metric and filter should describe the same cohort | Rename filter or narrow the queue? Business decision required. |
| Palette usage | CSS semantic variables (`index.css:61-94`) | Direct hex and utility red/sky classes (`Dashboard.tsx:56-60,115,611`) | Semantic tokens for repeated meanings | Which colors are enterprise semantics vs board branding? |

## Decisions that should remain local

- SC1/SC3 classification hierarchy, Ctrl/Cmd additive team selection, session selection defaults and the “All groups / All” controls (`src/pages/Dashboard.tsx:174-185,436-529`; `src/hooks/use-production-data.ts:236-302`).
- KPI names and rules for production status/overdue dates, WO Qty “remaining / scheduled,” queue priority order, and date-based production sorting (`src/pages/Dashboard.tsx:137-219,531-563,610-705`; `src/hooks/use-production-data.ts:305-381`).
- Work-order and sales-line fields, order detail layout, linkage/error terminology, Excel column schema and filename (`src/components/OrderDetailsDialog.tsx:21-143`; `src/lib/export-production-grid.ts:10-94`).
- Dark green/lime visual identity, maximum board width and dense 11-column production view are observed choices, not proof that all enterprise applications should use them (`src/index.css:61-99`; `src/pages/Dashboard.tsx:420,607-625`).
- Microsoft/Admin Console authorization copy and access flow are integration/business policy, not a UX foundation contract (`src/components/LoginGate.tsx:36-65`; `src/hooks/use-auth.tsx`).

## Suggested consolidation boundary (for future human review)

Extract *mechanics* first—labeled inputs, accessible sort/filter controls, semantic table primitives, feedback states, status-badge API and Sheet behavior—while keeping production data definitions, priority calculations, status mapping and board layout local. Resolve the inconsistencies above before promoting visual or interaction rules to enterprise status. This document makes no changes to the application and does not define a new shared TypeScript package.