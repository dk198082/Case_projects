# Production Priority Board

An internal operations board that turns current machine work orders and related sales demand into a clear, traceable build sequence for each SC3 production team.

## Run & Operate

- `pnpm --filter @workspace/production-priority-board run dev` — run the Production Priority Board
- `pnpm --filter @workspace/api-server run dev` — run the shared API server that serves the live Azure production snapshot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Azure PostgreSQL credentials are supplied through `AZURE_PG_*` secrets. Never put the connection string or password in source control or the browser.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `attached_assets/MACHINE_ORDERS_(32)_1787544195788.xlsx` — original workbook source.
- `artifacts/production-priority-board/public/data/production-workbook.json` — original workbook extract retained for traceability; it is no longer the runtime source.
- `artifacts/api-server/src/routes/production-priority.ts` — read-only Azure PostgreSQL adapter that normalizes `d365fo.vw_salesprodmachines365` into the board API contract and caches snapshots briefly.
- `lib/api-spec/openapi.yaml` — source of truth for the live priority-snapshot contract; generated Zod/API-client artifacts must be refreshed after changes.
- `artifacts/production-priority-board/src/hooks/use-production-data.ts` — live snapshot query, SC3 selection, filtering, priority sorting, KPIs, and data-quality view models.
- `artifacts/production-priority-board/src/pages/Dashboard.tsx` — board presentation and interactions.
- `artifacts/production-priority-board/src/lib/review-content.ts` — single versioned requirements-review manifest; update it and its review date whenever user-visible behavior, source rules, or scope decisions change.
- `artifacts/production-priority-board/src/lib/dataflow-content.ts` — single versioned dataflow manifest; update it when source objects, joins, rules, API fields, or browser calculations change.
- `artifacts/production-priority-board/scripts/generate-documents.ts` — renders both manifests into self-contained downloadable HTML documents under `public/documents/`; rerun after manifest changes.

## Architecture decisions

- Azure PostgreSQL is the runtime source. The workbook remains an audit/reference export; the browser only talks to the read-only `/api/production-priority` endpoint.
- The Azure adapter applies mandatory source filters before producing orders, future demand, KPIs, or team lists: it excludes item `02002107`, completed/reported-finished statuses, and sales-order pools containing `Consign`; it also requires the approved SC1, SC2, and SC3 values.
- Work-order priority is driven by the internal production delivery date; customer ship date is shown as secondary context and used only as a tie-breaker.
- Sales/customer information is displayed only after deterministic sales-order and item-number linkage to the related-order sheet; unmatched records retain an explicit unlinked state.
- Only STARTED and RELEASED orders appear on the board; any other status (Scheduled, Complete, blank, or unrecognized) is excluded entirely, and a stop condition no longer overrides displayed status or executable priority.

## Product

- Select any available SC3 production team and see its active work-order queue in priority order.
- Identify started, released, and past-due work at a glance.
- Search within a team or across teams, adjust simple operating filters, inspect full order details, and refresh the live Azure snapshot.
- Open a discreet data-quality panel that shows linkage, validation, and future-demand-without-work-order counts (the Board no longer shows a separate demand list or KPI for this).
- Download the requirements review and dataflow documents separately from the application tabs.

## User preferences

- Keep the product focused on production priority and order visibility; do not add capacity planning, loading, utilization, finite scheduling, available-hours, or bottleneck calculations.

## Gotchas

- The live Azure view uses quoted mixed-case resource columns (`Resource`, `Resource1`, `Task`, `Assy_Resource`, `MachineResource`); query them with quotes and alias them to stable API field names.
- Azure view date placeholders from the year 1900 are not meaningful production dates and must be treated as blank before calculating ship/build conditions.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
