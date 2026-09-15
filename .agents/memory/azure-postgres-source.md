---
name: Azure PostgreSQL production source
description: The Production Priority Board uses Azure PostgreSQL as its authoritative runtime source.
---

When Azure PostgreSQL secrets are configured, prefer that connection over the workspace-managed `DATABASE_URL`.

**Why:** Both connections can exist in the runtime. The managed database does not contain the Dynamics 365 production views, so choosing it first makes the board fail against a missing relation.

**How to apply:** Keep Azure access server-side and expose normalized, read-only board data through the API. Treat the workbook only as an audit/reference extract, not as a silent runtime fallback.