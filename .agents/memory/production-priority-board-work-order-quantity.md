---
name: Production Priority Board Work Order quantity
description: Verified D365FO source and aggregation rules for Work Order quantity.
---

Display Work Order quantity as `remainingreportasfinishedquantity / scheduledquantity`. Fall back from scheduled to `estimatedquantity`; fall back from missing remaining quantity to the resolved scheduled quantity.

**Why:** Supervisors need current unfinished workload in filter and KPI totals, while still seeing the original scheduled quantity for context. `orderedsalesquantity` is Sales Order quantity and must not be substituted.

**How to apply:** SC1/SC3 selector totals, KPI totals, and visible summary totals sum remaining report-as-finished quantity. The grid shows remaining first and scheduled second in a lighter style. Keep data-quality metrics as record counts.