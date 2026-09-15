---
name: Sales-linkage audit safety
description: Safety and responsiveness constraints for reconciling production orders to source sales lines in Azure PostgreSQL.
---

Keep linkage validation exact and responsive without changing independent stop behavior.

**Why:** The Azure source is expensive to interrogate repeatedly, while an order with incomplete linkage context can still have an active sales-processing stop that must prevent prioritization.

**How to apply:** Require non-blank sales order, company/data area, item, and inventory-lot demand identifiers before treating a link as validated. Keep stop evaluation independent from linkage qualification, and expose a lot that actually matched production demand when one exists.