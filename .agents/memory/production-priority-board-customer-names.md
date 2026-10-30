---
name: Production Priority Board customer-name source
description: Verified D365FO distinction between the Sales Order customer name and delivery-address display name.
---

Use `salesorderheaderv3staging.salesordername` as the Production Priority Board customer name. Keep `deliveryaddressname` only for the ship-to destination.

**Why:** Live joined rows show that `deliveryaddressname` can identify a plant, building, government site, or other ship-to location, while `salesordername` contains the actual customer name from the Sales Order header.

**How to apply:** When mapping active orders or future demand, prefer the directly joined Sales Order header value. A view-provided `salesordername` is an acceptable fallback; never prefer `deliveryaddressname` for the customer field.