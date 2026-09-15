import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import express from "express";
import session from "express-session";

type AccessReply = {
  allowed: boolean;
  reason: string | null;
  roles: string[];
};

const appName = "Production Priority Board";
let accessReply: AccessReply = {
  allowed: true,
  reason: null,
  roles: ["Read / Write"],
};

const adminServer = createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(accessReply));
});

await new Promise<void>((resolve) => adminServer.listen(0, "127.0.0.1", resolve));
const address = adminServer.address();
assert(address && typeof address !== "string");

process.env.ADMIN_CONSOLE_URL = `https://localhost:${address.port}`;
process.env.ADMIN_CONSOLE_API_KEY = "integration-test-key";
process.env.ADMIN_CONSOLE_APP_NAME = appName;
process.env.CLIENT_ID ||= "integration-test-client";
process.env.TENANT_ID ||= "integration-test-tenant";
process.env.CLIENT_SECRET ||= "integration-test-secret";

const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname === "localhost" && url.port === String(address.port)) {
    url.protocol = "http:";
    url.hostname = "127.0.0.1";
    return originalFetch(url, init);
  }
  return originalFetch(input, init);
};

const { checkAdminConsoleAccess } = await import("../lib/auth");
const { requireLogin, requireRole } = await import("./auth");

const app = express();
app.use(express.json());
app.use(
  session({
    secret: "integration-test-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }),
);
app.use((req, _res, next) => {
  req.log = {
    warn() {},
    error() {},
  } as unknown as typeof req.log;
  next();
});
app.post("/test/session", (req, res) => {
  req.session.user = {
    entraOid: "test-entra-object-id",
    email: "operator@example.test",
    displayName: "Test Operator",
    role: "editor",
  };
  req.session.authorizationCheckedAt = 0;
  res.sendStatus(204);
});
app.post("/test/expire-authorization", (req, res) => {
  req.session.authorizationCheckedAt = 0;
  res.sendStatus(204);
});
app.get("/api/data", requireLogin, (req, res) => {
  res.json({ role: req.session.user?.role });
});
app.get("/api/edit", requireRole("editor"), (_req, res) => {
  res.json({ editable: true });
});

const apiServer = app.listen(0, "127.0.0.1");
await once(apiServer, "listening");
const apiAddress = apiServer.address();
assert(apiAddress && typeof apiAddress !== "string");
const apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;

let cookie = "";
const request = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
  return response;
};

const seedEditorSession = async () => {
  accessReply = {
    allowed: true,
    reason: null,
    roles: ["Read / Write"],
  };
  const response = await request("/test/session", { method: "POST" });
  assert.equal(response.status, 204);
};

test("revalidation updates an editor session to viewer without a new login", async () => {
  await seedEditorSession();
  assert.equal((await request("/api/edit")).status, 200);

  accessReply = {
    allowed: true,
    reason: null,
    roles: ["Read Only"],
  };
  await request("/test/expire-authorization", { method: "POST" });

  assert.equal((await request("/api/edit")).status, 403);
  const dataResponse = await request("/api/data");
  assert.equal(dataResponse.status, 200);
  assert.deepEqual(await dataResponse.json(), { role: "viewer" });
});

test("Admin Console denial destroys the session and protected APIs return 401", async () => {
  await seedEditorSession();
  accessReply = { allowed: false, reason: "Access revoked", roles: [] };
  await request("/test/expire-authorization", { method: "POST" });

  assert.equal((await request("/api/data")).status, 401);
  assert.equal((await request("/api/data")).status, 401);
});

test("exact Admin Console and legacy prefixed roles grant access", async () => {
  for (const [role, expected] of [
    ["Read Only", "viewer"],
    ["Read", "viewer"],
    ["Read / Write", "editor"],
    [`${appName} - Read Only`, "viewer"],
    [`${appName} - Read`, "viewer"],
    [`${appName} - Read / Write`, "editor"],
  ] as const) {
    accessReply = { allowed: true, reason: null, roles: [role] };
    assert.equal(
      await checkAdminConsoleAccess("test-entra-object-id"),
      expected,
    );
  }
});

test("unrecognized roles remain denied", async () => {
  const rejectedRoles = [
    ["Another App - read"],
    [`${appName} administrator`],
    ["Write"],
    ["Read Write"],
  ];

  for (const roles of rejectedRoles) {
    accessReply = { allowed: true, reason: null, roles };
    await assert.rejects(
      checkAdminConsoleAccess("test-entra-object-id"),
      /No recognized application role/,
    );
  }
});

test("Admin Console outage fails closed and destroys the session", async () => {
  await seedEditorSession();
  await request("/test/expire-authorization", { method: "POST" });
  await new Promise<void>((resolve) => adminServer.close(() => resolve()));

  assert.equal((await request("/api/data")).status, 401);
  assert.equal((await request("/api/data")).status, 401);
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise<void>((resolve) =>
    (apiServer as Server).close(() => resolve()),
  );
  if (adminServer.listening) {
    await new Promise<void>((resolve) => adminServer.close(() => resolve()));
  }
});