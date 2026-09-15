---
name: Production Priority Board KPI filter behavior
description: The relationship between the KPI counts and the queue status filters.
---

The four KPI cards are the queue filters: All Active, Started, Released, and Past Due. Their counts represent the current group/team/search scope before the selected status/date filter is applied.

**Why:** Operators need the category totals to remain visible while switching the queue view; recalculating the other KPI values from an already-filtered queue makes the strip misleading.

**How to apply:** Keep the active KPI selection synchronized with the queue filter and expose the selected state accessibly. Apply group, team, and search scope before calculating KPI totals and before applying the selected KPI filter to rows.