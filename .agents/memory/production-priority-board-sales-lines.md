---
name: Production Priority Board sales-order-line schema mapping
description: D365FO Azure column mapping for the order-details "Sales Order Lines" table, and a performance rule for joining large staging tables per-line.
---

## Field → column mapping (Azure `d365fo` schema, empirically verified against live data)

- **Line** → `linenum`/`linenumber` on `salesorderlinev2staging` (identical decimal values). Format with `Number(value).toString()` to strip trailing zeros. D365FO uses fractional values (e.g. `2.28125`) for lines inserted between existing lines — this is expected, not a bug.
- **Item** → `itemnumber`. **Description** → `itemdesc` fallback `linedescription`.
- **Configuration** → `productconfigurationid` on the line itself.
- **Config Name** → NOT on the line table. Join `ecoresproductmasterconfigurationtranslationstaging` on `productmasterconfigurationid = line.productconfigurationid AND productmasternumber = line.itemnumber`, preferring `languageid = 'en-us'`.
- **Reference** → the production order number *for that specific line*, found via `prodproductionorderheaderstaging` joined on `demandsalesordernumber/dataareaid/itemnumber/demandsalesorderlineinventorylotid = line.inventorylotid`. Only configured/produced lines get a value; stocked lines are blank (matches the Shop Floor App).
- **Status** → `salesorderlinestatus` integer: 1=Open order, 2=Delivered, 3=Invoiced, 4=Canceled (D365FO SalesStatus enum).
- Lines are joined per **whole sales order** (`salesordernumber`+`dataareaid`), not filtered to the one item matching the work order — the pop-out should show the full order-line list like the Shop Floor App does.

## Performance rule: never use a LATERAL/correlated subquery per output row against a large staging table

**Why:** A `LEFT JOIN LATERAL (... WHERE BTRIM(col) = BTRIM(outer.col) ... LIMIT 1)` is evaluated once per outer row. Because `BTRIM()` on the join key prevents btree index use, each evaluation becomes a full sequential scan of the target table. Joining ~4,000 sales-line rows against `prodproductionorderheaderstaging` (~170k rows) this way took the endpoint from ~1s to **2.5+ minutes**.

**How to apply:** When you need "the matching row's column" from a large table keyed by several BTRIM-normalized columns, pre-aggregate that table once into its own `MATERIALIZED` CTE with `DISTINCT ON (normalized key columns...) ORDER BY (normalized key columns...), <tiebreaker>`, then `LEFT JOIN` the deduplicated CTE into the main query on the normalized keys. This lets Postgres build one hash table over the whole side table instead of rescanning it per row. Applies to any future per-line/per-row enrichment against `salesorderlinev2staging` (354k rows), `prodproductionorderheaderstaging` (172k rows), or `ecoresproductmasterconfigurationtranslationstaging` (8.5k rows) in this Azure schema — same pattern the pre-existing `linkage_audit` CTE already used (plain JOINs + GROUP BY, never LATERAL).

Even after this fix, a cold-cache request (60s TTL) still costs ~15-30s end-to-end against Azure (large remote scans, e.g. the route-detail view alone is ~8-9s) — this is inherent to querying this source live, not a regression to chase further.
