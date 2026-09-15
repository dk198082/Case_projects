# Deploying Production Priority Board to Azure

This app already targets Azure in its architecture: Entra ID login, a
Postgres connection helper that accepts either discrete `AZURE_PG_*` fields
or a plain `DATABASE_URL` (`lib/db/src/index.ts`), and it already integrates
with the Data Admin Suite's `/api/access-check` for authorization — the same
centralized entitlement system Field Service Calendar, Production Calendar,
and Packing Control Board use. The changes here (`Dockerfile`,
`.dockerignore`, the `CORS_ORIGIN`-configurable CORS, and the `STATIC_DIR`
block added to `artifacts/api-server/src/app.ts`) make it deployable as a
single container — no auth or session code changes were needed.

**Auth wiring already correct:** this app has exactly one data route,
`GET /api/production-priority`, and it's already gated with `requireLogin`
— nothing to fix here, unlike a couple of earlier apps in this family that
had an auth middleware imported but never actually applied.

## Recommended shape: one container, one Azure resource

`Dockerfile` builds the API server and the `production-priority-board`
frontend, and the API server serves the built frontend itself (`STATIC_DIR`
env var — see the block in `app.ts`). One Azure resource to run.

## 1. Azure resources to create

| Resource | Purpose |
|---|---|
| Azure Container Registry (ACR) | Stores the built image |
| Azure App Service (Linux, "Web App for Containers") **or** Azure Container Apps | Runs the container |
| Azure Database for PostgreSQL – Flexible Server | Application data + session store |
| Azure App Registration (Entra ID) | This app's own login |

This app calls the Data Admin Suite's `/api/access-check` for
authorization — that app (and its own Azure deployment) must already exist
and be reachable before this app's users can log in.

## 2. Build & push the image

```bash
az acr login --name <your-acr-name>
docker build -t <your-acr-name>.azurecr.io/production-priority-board:latest .
docker push <your-acr-name>.azurecr.io/production-priority-board:latest
```

## 3. Environment variables (App Settings / Container Apps secrets)

| Variable | Required | Notes |
|---|---|---|
| `AZURE_PG_HOST` / `AZURE_PG_PORT` / `AZURE_PG_DATABASE` / `AZURE_PG_USER` (or `AZURE_PG_SP_USER`) / `AZURE_PG_PASSWORD` | Yes, unless using `DATABASE_URL` instead | Discrete connection fields — used if **all** are set |
| `DATABASE_URL` | Yes, unless using the discrete fields above | Falls back to this if the discrete `AZURE_PG_*` fields aren't all present. **Read the TLS note below before choosing which path to use.** |
| `AZURE_PG_SCHEMA` | No | Defaults to `public` — set this if the app's tables/sessions live in a named schema instead |
| `AZURE_PG_SSLMODE` | No | Only `disable` has any effect (turns TLS off entirely) — see the TLS note below |
| `SESSION_SECRET` | Yes | Signs the session cookie |
| `APP_ORIGIN` | Yes in production | This app's own public HTTPS origin (e.g. `https://priority.yourorg.com`) — used to derive the default Entra ID redirect URI |
| `AUTH_REDIRECT_URI` | No | Only needed if the callback URL should differ from `${APP_ORIGIN}/api/auth/callback` |
| `ENTRA_TENANT_ID` / `TENANT_ID` | Yes | From this app's own Azure App Registration — **must be the same tenant** as the Data Admin Suite and every other app sharing single sign-on |
| `ENTRA_CLIENT_ID` / `CLIENT_ID` | Yes | This app's own App Registration client ID |
| `ENTRA_CLIENT_SECRET` / `CLIENT_SECRET` | Yes | This app's own App Registration client secret |
| `ADMIN_CONSOLE_URL` | Yes | Base URL of the deployed Data Admin Suite |
| `ADMIN_CONSOLE_API_KEY` | Yes | Matches an API key configured on that deployment for `/api/access-check` |
| `ADMIN_CONSOLE_APP_NAME` | No | Defaults to `"Production Priority Board"` — must match the app's name in the Admin Console's `apps` table exactly (case-insensitive) if changed |
| `CORS_ORIGIN` | No | Only needed for a split (frontend/API on different origins) deployment |
| `LOG_LEVEL` | No | Pino log level |
| `PORT` | No | Azure sets this for you; the Dockerfile defaults it to `8080` |
| `STATIC_DIR` | No | Already set by the Dockerfile |

## ⚠️ TLS certificate validation — worth a deliberate decision, not a default

`lib/db/src/index.ts`'s Azure connection path uses
`ssl: { rejectUnauthorized: false }` when TLS is enabled — meaning it
accepts **any** server certificate without verifying it against a trusted
CA. This isn't the pattern other apps in this project family use: the Data
Admin Suite's own documented lesson (`.agents/memory/azure-pg-connection.md`)
specifically recommends `rejectUnauthorized: true`, noting "Azure PG certs
chain to public CAs, so `rejectUnauthorized: true` works." In practice, a
real Azure Database for PostgreSQL – Flexible Server's certificate does
chain to a public CA, so switching this to `true` should work without
further changes — but this wasn't changed here, since flipping a TLS
validation setting is a real behavior change worth a deliberate choice, not
something to alter silently. Consider changing this to
`rejectUnauthorized: true` for production, matching the rest of this
project family, unless there's a specific reason (e.g. a private CA/internal
proxy in front of the database) this app needs the looser setting.

## 4. Register the app in Entra ID

Same steps as every other app in this project family:

1. Azure Portal → Microsoft Entra ID → App registrations → New registration.
2. Redirect URI (Web platform): `https://<your-domain>/api/auth/callback`
   (or whatever `AUTH_REDIRECT_URI` is set to, if overridden).
3. Grant admin consent for the requested scopes so users never see a
   one-time consent prompt.
4. Store the client secret in Key Vault / App Settings.
5. **Confirm the tenant ID matches** the Data Admin Suite's own tenant — a
   mismatch means users are always prompted to log in again when opening
   this app, with no error message pointing at why.

## 5. Onboard this app in the Data Admin Suite

Before anyone can log in here, the Data Admin Suite needs an `apps` row
named **exactly** `Production Priority Board` (or whatever
`ADMIN_CONSOLE_APP_NAME` is set to), with at least one role and users
assigned to it. There's no `editor`/`viewer` distinction to worry about
here specifically — this app only has one route and it's read-only, so any
role that grants login is sufficient.

## 6. Provision the sessions table (required, and easy to miss)

`lib/db/src/schema/index.ts` is the unmodified Drizzle boilerplate — this
app has **no application tables of its own** (it reads D365 F&O BYOD
staging tables directly via raw SQL in `production-priority.ts`, not
through Drizzle), so `drizzle-kit push` correctly reports "No changes
detected" and creates nothing. That includes the `sessions` table
`connect-pg-simple` needs (`lib/session.ts` sets
`createTableIfMissing: false`, and there's no other schema file for it).

**Confirmed directly:** booting this app against a database with the table
present works cleanly end-to-end (health check, static hosting, and the
auth-gated route all behave correctly). Booting it *without* the table
doesn't fail immediately — a plain unauthenticated request never touches
the session store — but the real login flow (which writes session data on
callback) will fail once it tries to persist a session. Create the table
once, per environment, before anyone can actually log in:

```sql
CREATE TABLE IF NOT EXISTS public.sessions (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   jsonb   NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON public.sessions (expire);
```

If `AZURE_PG_SCHEMA` is set to something other than `public`, create this
table in that schema instead (`connect-pg-simple`'s `schemaName` option in
`lib/session.ts` follows it).

## 7. Push the Drizzle schema

```bash
export DATABASE_URL="postgres://<user>:<percent-encoded-password>@<host>:5432/<database>"
pnpm --filter @workspace/db run push
```

This won't create anything (see the note above) — it's here for
completeness and because it's a fast way to confirm the connection string
itself works before moving on. Same caveat as this project family's other
apps: if the real password has special characters, percent-encode it for
this one command — the schema-push tooling (`drizzle.config.ts`) always
needs a connection string, even though the app's own runtime can use
discrete `AZURE_PG_*` fields instead to avoid exactly that problem.

## 8. Health check

`GET /api/healthz` — point Azure's health probe at it.

## Things found while validating this export

- **Fixed in documentation, not code (this is an infrastructure step, not a
  code bug):** the `sessions` table isn't created by anything automatically
  — added the manual SQL above after confirming directly that the app boots
  and serves correctly once it exists. Skipping this step doesn't fail
  loudly on a plain request; it only surfaces once someone actually tries
  to log in, which makes it an easy thing to miss until the first real user
  hits it.
- **Worth a deliberate decision, not fixed silently:** see the TLS
  certificate validation note above (`rejectUnauthorized: false`) — flagged
  rather than changed, since it's a real security-relevant behavior change.
- No broken code found otherwise — the build is clean, and both the API
  server's and the frontend's existing test suites pass without any
  changes needed.

## 🆕 New in this export: Export to Excel

`Dashboard.tsx` gains an "Export to Excel" button, wired to a new
`export-production-grid.ts` (client-side, using `exceljs` — no server round
trip, exports exactly the rows currently loaded and their currently-assigned
priority order). No deployment changes needed: purely a frontend addition,
no new routes, no new environment variables. Ships with its own test file
(`production-grid.test.ts`) covering the priority-ordering logic the export
reads from.
