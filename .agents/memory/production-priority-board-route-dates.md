---
name: Production Priority Board — route-derived build dates (Azure D365FO)
description: How Build Start/End dates are computed from the D365FO production route in Azure, and gotchas in the source data that caused wrong results if not filtered carefully.
---

## Source view
Use `vw_productionroutedetailsd365` (per-operation route rows, already joined to the order header, includes a descriptive `operationname`) to derive per-work-order build dates. It has full coverage of active (STARTED/RELEASED) work orders.

**Rejected candidate:** `vw_salesprodmfimachines365routev2` looks structurally ideal (same "365" naming convention, per-op actual start/end dates) but is a stale/limited snapshot — only matched ~2/260 currently active orders in testing. Don't reach for it again without re-verifying coverage against live active orders first.

**Sequencing gotcha:** `operationnumber` ascending is the true chronological route order. The `routeoperationsequence` column is unreliable/reversed for ordering — do not use it to sequence operations.

**Date fields:** Only `scheduledfromdate`/`scheduledenddate` vary per operation. `starteddate`/`endeddate` are order-level (constant across all operation rows) and `endeddate` is almost always the 1900-01-01 placeholder for in-progress orders — there is no reliable per-operation "actual" date field.

## Warehouse step classification
Classify an operation as a warehouse staging step via `operationname ILIKE 'Warehouse Pick%'` / `'Warehouse Receive%'` — this literal name match is reliable (verified against the real operation catalog) and more robust than guessing operation-number code prefixes.

## Computing Build Start / Build End
**Why:** The route can contain warehouse pick/receive steps at the start/end that aren't real production work, plus duplicate `(productionordernumber, operationnumber)` rows from route revisions — some of which are unpopulated 1900-01-01 placeholders that can win a tie if not explicitly filtered out.

**How to apply:**
1. First exclude ALL warehouse steps (both pick and receive) from the candidate set — not just "exclude pick from the start calc, receive from the end calc" independently. A route can end in nothing but a lone Warehouse Pick step (order not yet scheduled past pick) and asymmetric filtering will incorrectly let that pick step's date leak into the "end" calculation.
2. Among the remaining non-warehouse rows, only consider rows whose date is a real date (`EXTRACT(YEAR FROM date) >= 2000`) before picking the first/last by `operationnumber` — this avoids picking a 1900 placeholder duplicate over the real dated row when the same operation number appears more than once.
3. Build Start Date = earliest such row's `scheduledfromdate` (ascending by `operationnumber`, tiebreak by date ascending). Build End Date = latest such row's `scheduledenddate` (descending by `operationnumber`, tiebreak by date descending). If no non-warehouse dated row exists at all (route hasn't progressed past the pick step yet), both come back blank — a reasonable fallback for Build End is the order's `deliverydate`.

## Calendar-date timezone semantics

Treat the route's build start/end values as ERP calendar dates, not instants in time. Preserve and display the UTC year/month/day components, and compare those calendar components for past-due logic.

**Why:** PostgreSQL/Node returns these dates as UTC-midnight timestamps. Formatting them in a browser's local timezone (for example, America/New_York) shifts midnight UTC into the prior evening, displaying every date one day early. Work order 366208 confirmed the source/API values were July 15 and July 31, 2026 while local-time formatting could show July 14 and July 30.

**How to apply:** Any UI or server rule consuming build dates must use UTC calendar components rather than local-time conversion. Do not call `toLocaleDateString()` or a local-time `Intl.DateTimeFormat` directly on these ISO values, and do not compare their raw timestamp to local midnight.
