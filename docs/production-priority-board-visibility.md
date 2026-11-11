# Production Priority Board visibility conditions

> Historical audit reference: the eligibility rules below were superseded on
> 6 November 2026. The current scope is documented in
> [Production Priority Machine scope](production-priority-machine-scope.md).
> Do not use the historical classification lists or sales-demand gates for new work.

Verified against the Azure source-view and refresh-procedure definitions and
the current API and browser code on 21 October 2026.

## 1. Source-data and sales-demand eligibility

- The relevant production order must exist in the Azure shadow staging data.
  An ERP change not yet synchronized is not visible.
- The source view is explicitly TOUS-only. Another company's record is excluded.
- A sales-order header and sales-order line must exist and match each other on
  exact sales-order number and company. Both statuses must be numeric 1 (open).
- The production order must match a qualifying sales line on **all four**
  keys: demand sales-order number, company, item number, and demand-line inventory
  lot ID against the sales line's inventory lot ID. Null keys do not equal one
  another; identifiers are not trimmed or case-normalized by these joins.
- A released-product staging record must match the sales line's item and company.
- Responsible-person/worker and configuration-translation records are optional.
  The worker join was corrected from INNER to LEFT JOIN. The lookup still uses
  exact personnel-number equality; a failed lookup leaves employee metadata blank.

Although the production-order join itself is LEFT JOIN, a row without a matched
production order has no work-order identifier or Started/Released status and
cannot become a board work order. Stock orders without qualifying sales demand
are therefore outside this source view's board population.

## 2. Cache population rules

The existing `d365fo.sp_refresh_production_priority_cache()` procedure reads
`d365fo.vw_salesprodmachines365_app` and applies these rules:

- Item, after trimming, must not be `02002107`.
- SC1, after trimming, must be exactly one of: `Automated`, `FoldingEnd`, `HDT`,
  `Met-Impact`, `MFI`, `Plas-Impac`, `Retrofit`, `SL-Series`, `Torsion`, `Horizontal`.
- SC2, after trimming, must be exactly one of: `Electmech`, `Machine`, `Hydraulic`.
- SC3, after trimming, must be exactly one of: `2000SL`, `SL-ST`, `Misc`, `IT406`,
  `HDVT3`, `600SL`, `Torsion`, `300SL`, `1000SL`, `NO-CNSL`, `MP1500`, `MP1200MAN`,
  `MP1200MWLD`, `MP1200ETO`, `CNSL-HYD`, `IT542`, `799`, `CNSL-NOHYD`, `HDVT6`.
- Classification lists are case-sensitive; blanks, missing classifications, and
  values outside the lists fail.
- Sales-order pool must not contain `Consign` anywhere, case-insensitively.
  A blank/null pool is allowed.
- Status, after trimming, removing spaces, and uppercasing, must not be
  `COMPLETED` or `REPORTEDFINISHED`.

The procedure's linkage audit groups every machine row and joins it back by
audit-row identity. It does **not** filter on the resulting linkage booleans.
Build-route dates, production-group names, configuration descriptions, and
sales-line detail JSON are optional enrichments, not additional eligibility gates.

## 3. API admission and freshness

- The prepared cache must have been successfully rebuilt after relevant upstream
  data or view changes. A corrected view alone does not update existing cache rows.
- The API requires a nonblank trimmed work-order number and a status recognized
  as Started or Released. The source view maps numeric production status 3 to
  Released and 4 to Started. Created, Estimated, Scheduled, ReportedFinished,
  Completed, and unrecognized statuses do not enter the board queue.
- The API normalizer uppercases the status text and recognizes `START` or
  `RELEASE` substrings; it does not independently admit a row based on the numeric
  status when the text is blank or inconsistent.
- The API caches successful responses for 60 seconds. Browser Refresh bypasses
  that API cache but does not rebuild the database snapshot or synchronize F&O.
- The browser also has a 60-second query stale time, no interval polling, and
  no refetch on window focus. An already-open board can retain its previous
  snapshot until Refresh, reload, or another fetch.
- API/database/authentication failures can prevent the board from loading.
  A failed refresh retains the previous browser snapshot rather than proving
  that a missing order was removed.

The API's displayed `dataAsOf` is the API read time, not the upstream ERP
synchronization time or the database cache-refresh time.

## 4. Browser filters that hide an admitted order

- Selected SC1 groups and SC3 teams; multiple choices are supported and saved
  in session storage. Empty selections mean All.
- Active KPI selection: Started hides Released; Released hides Started.
  Build Date Past Due and Ship Date Past Due require a usable respective date
  before today; missing dates fail those filters.
- Ship Date Within X Weeks requires a usable ship date and a positive whole
  number of weeks. Its current upper-bound-only comparison also includes overdue
  dates; it does not require a date on or after today.
- Every active column text filter must match, case-insensitively, as a substring:
  priority, work order, quantity (remaining/scheduled), part (item/description),
  sales order, customer, build start date, build end date, ship date, status, and
  production group (ID/name).
- Every active from/to date range on build start, build end, or ship date must
  match, inclusively. A blank date fails an active range.

For date filters, API build end uses route-derived build end with production
delivery date as fallback. Ship date uses confirmed header shipping date with
requested header shipping date as fallback. Dates before year 2000 are treated
as absent. Sorting only reorders the queue; it does not remove rows.

To remove screen-only exclusions, select All groups, All teams, and All Active,
and clear column text and date-range filters.

## 5. Not exclusion conditions

Zero or missing remaining quantity, missing dates, missing responsible person,
missing configuration translation, missing route/resource enrichment, missing
production-group name, missing shipping destination, stop/hold indicators, and
Partial/Unlinked audit labels are not independent API exclusion rules.
The six-digit work-order check is a data-quality count, not an admission rule.

This does not bypass the required source joins: an order with no matching sales
demand can already have been lost before the API has any row to label.

## Approved maintenance

`lib/db/scripts/make-worker-enrichment-optional.mjs` performs explicit one-time
maintenance. By default it only inspects. `--apply --refresh-cache` replaces only
the worker join and invokes the existing cache procedure in a transaction.
Verification rejects a refresh that loses any previously cached work-order/company
identity or fails to include the diagnosed order. Do not attach this script to
startup, login, API routes, or browser Refresh.
