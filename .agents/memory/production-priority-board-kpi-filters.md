---
name: Production Priority Board KPI filter behavior
description: The relationship between the KPI counts and the queue status filters.
---

KPI totals should retain the broader group/team scope while operators switch the selected status/date filter.

**Why:** Operators need the category totals to remain visible while switching the queue view; recalculating the other KPI values from an already-filtered queue makes the strip misleading.

**How to apply:** Preserve the distinction between scoped category totals and the selected queue. Do not calculate the other KPI totals from the already-filtered queue when adding views or filters.