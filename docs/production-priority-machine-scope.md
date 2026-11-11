# Production Priority Machine scope

Effective 6 November 2026, the confirmed eligibility rule is:

- Company: **TOUS**
- Released-product Sales Classification 2: **Machine**, after trimming
- Production status: **Released (3)** or **Started (4)**
- A validated Sales Order header and demand-line link, matching company,
  Sales Order, item, and inventory lot.

Every work order meeting those criteria is admitted. SC1 and SC3 have no
allowlists. Item 02002107, consignments, and closed sales-header/line statuses
are not additional exclusions. Stock orders and missing/partial Sales Order
links are excluded. Scheduled, completed, and non-Machine orders remain outside scope.

## Data path

The app source view starts from production orders, not sales demand. The released
product determines SC2. A matching sales header and exact demand sales line are
required. Employee and configuration-translation lookups remain optional. A missing
optional enrichment cannot remove the work order. The view produces one row per
company/work-order identity.

The existing external refresh procedure publishes the prepared cache. Board
requests still only read that cache; login and browser Refresh do not rebuild it.
The API repeats company/SC2/status and validated-link checks defensively.

Configuration ID comes directly from the production order. Its preferred en-us
description is cached separately, without inferring configuration from another
sales line.

Sales linkage remains strictly audited using company, sales order, item, and
inventory-lot demand. Only fully validated links are admitted; merely having a
Sales Order number is insufficient. Missing shipment dates or descriptive fields
do not independently exclude an otherwise validated order. Future demand remains
zero: the prepared population contains work orders, not sales-only future demand.

## New and blank SC3 values

SC3 options are generated from eligible returned orders, not maintained in code
or SQL. New values appear automatically after the normal upstream load and cache
publication. Blank SC1/SC3 values are presented as **Unclassified**, while the
data-quality count still measures the raw missing SC3 values.

**All groups / All teams / All Active**, with column/date filters cleared, shows
the complete eligible dataset. Saved operator selections can intentionally narrow
it; a new model does not override a user's chosen group or team.

## Maintenance and verification

- `lib/db/sql/production-priority-machine-source.sql`: authoritative app-view SQL.
- `lib/db/scripts/apply-machine-board-scope.mjs`: explicit one-time atomic migration,
  preserving the previous view/procedure definitions in ignored generated output.
  It never runs at startup or during requests.
- `lib/db/scripts/require-sales-linked-machines.mjs`: explicit one-time maintenance
  restoring the required Sales Order link on an already broadened Machine scope.
- `artifacts/api-server/scripts/verify-production-snapshot.ts`: read-only check of
  the actual API normalization against all source-eligible work-order identities.
  It rejects missing, extra, and duplicate identities.

The original scope used an explicit model list that omitted IT503 and IT504.
That historical list is no longer an admission policy. Future taxonomy changes
must not reintroduce an SC1/SC3 eligibility allowlist.
