---
name: Production Priority cache ownership
description: Responsibility split for the board's prepared PostgreSQL snapshot and its upstream refresh.
---

The board's snapshot request path must only read the prepared production-priority cache. The external D365FO/Fabric source-load orchestration owns refreshing it after all required loads succeed, and that refresh owns the exact source-population filters. Do not call the refresh procedure during login, API requests, or frontend refresh.

**Why:** The previous per-request multi-source query made cold loads take tens of seconds. A prepared snapshot removes that work from the user-facing path, but on-demand refresh would reintroduce the delay and might run against incomplete upstream loads.

**How to apply:** When changing board data or filters, coordinate the cache refresh logic and its pipeline placement with the external data owner. Keep the API's response mapping and in-memory cache separate from the database cache. Validate cache freshness and required fields before relying on a new cache schema.

Detail-only metadata absent from the cache may use a separate authenticated, narrowly scoped lookup on drill-down open. Shipping Destination uses the sales-order shipping address's city, state and country, not the delivery-address name or customer name.

**Why:** The user requested that address information, but it is not in the prepared cache. A point lookup keeps the queue fast without changing the externally owned cache pipeline or interpreting a destination name as an address.

**How to apply:** Resolve the work order and company through the prepared cache, then look up only its sales-order header. Keep the new metadata request out of the main snapshot query, show lookup failures explicitly, and never refresh the external cache from the detail panel.

Manual ERP deletions need a separate, durable reconciliation policy. The user reports that work orders manually deleted in F&O cannot propagate those deletions into the app data, and says the Admin Console Work Order Purge was designed for the Production Shop Floor app. That statement does not establish the purge's actual table coverage.

**Why:** An incremental feed can leave deleted work orders in downstream data, and deleting only the prepared snapshot can allow them to return on its next rebuild.

**How to apply:** Inspect the Admin Console purge implementation before recommending it for this board. Any proposed shared exclusion or purge must account for company plus work-order identity and the external cache rebuild. Do not infer cross-app coverage from the purge tab's name.

Responsible-person employee metadata is optional enrichment, not a board eligibility requirement. Keep that lookup optional while preserving the required sales-demand and product-scope rules.

**Why:** A blank responsible personnel number previously removed an otherwise eligible Started work order before it reached the snapshot. The user authorized correcting this, not weakening sales or classification eligibility.

**How to apply:** Preserve LEFT JOIN behavior for employee enrichment when revising or recreating the source view, including in upstream-managed SQL definitions. Ordinary refresh remains externally owned; an authorized one-time maintenance rebuild does not justify refresh-on-request behavior.