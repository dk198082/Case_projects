import { Router, type IRouter } from "express";
import {
  AdminConsoleAccessDeniedError,
  AUTH_SCOPES,
  checkAdminConsoleAccess,
  createAuthState,
  getApplicationOrigin,
  getRedirectUri,
  getSessionUser,
  msalClient,
  sanitizeReturnTo,
} from "../lib/auth";
import { SESSION_COOKIE_NAME } from "../lib/session";
import { requireLogin } from "../middleware/auth";

const router: IRouter = Router();

declare module "express-session" {
  interface SessionData {
    embeddedLogin?: boolean;
  }
}

const saveSession = (session: Express.Request["session"]) =>
  new Promise<void>((resolve, reject) => {
    session.save((error) => (error ? reject(error) : resolve()));
  });

const regenerateSession = (session: Express.Request["session"]) =>
  new Promise<void>((resolve, reject) => {
    session.regenerate((error) => (error ? reject(error) : resolve()));
  });

router.get("/login", async (req, res, next) => {
  try {
    const embeddedLogin = req.query.embedded === "1";

    req.session.embeddedLogin = embeddedLogin;

    // If Workspace is requesting embedded authentication and this
    // Production Priority session already has a user, don't make
    // the user sign in again.
    if (embeddedLogin && req.session.user) {
      res.redirect("/api/auth/embedded-complete");
      return;
    }

    const state = createAuthState();

    req.session.authState = state;
    req.session.returnTo = sanitizeReturnTo(req.query.returnTo);

    await saveSession(req.session);

    const authUrl = await msalClient.getAuthCodeUrl({
      scopes: AUTH_SCOPES,
      redirectUri: getRedirectUri(req),
      state,
      prompt: "select_account",
    });

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

router.get("/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  const expectedState = req.session.authState;
  const embeddedLogin = req.session.embeddedLogin === true;

  delete req.session.authState;
  delete req.session.embeddedLogin;

  if (!code || !state || !expectedState || state !== expectedState) {
    res.status(400).type("text").send("Invalid or expired sign-in request.");
    return;
  }

  try {
    const result = await msalClient.acquireTokenByCode({
      code,
      scopes: AUTH_SCOPES,
      redirectUri: getRedirectUri(req),
    });

    const claims = (result.idTokenClaims || {}) as Record<string, unknown>;

    const entraOid =
      typeof claims.oid === "string" ? claims.oid.trim() : "";

    if (!entraOid) {
      throw new Error("Microsoft Entra did not return the user's Object ID.");
    }

    const role = await checkAdminConsoleAccess(entraOid);
    const user = getSessionUser(claims, role);

    const returnTo = sanitizeReturnTo(req.session.returnTo);

    await regenerateSession(req.session);

    req.session.user = user;
    req.session.authorizationCheckedAt = Date.now();

    // Preserve embedded state across session regeneration.
    req.session.embeddedLogin = embeddedLogin;

    await saveSession(req.session);

    // Embedded Workspace login:
    // send the popup back to the Workspace instead of loading
    // the Production Priority UI inside the popup.
    if (embeddedLogin) {
      res.redirect("/api/auth/embedded-complete");
      return;
    }

    res.redirect(returnTo);
  } catch (error) {
    if (error instanceof AdminConsoleAccessDeniedError) {
      req.log.warn(
        {
          denialType: error.denialType,
          returnedRoles: error.returnedRoles,
        },
        "Production Priority denied application access",
      );

      res
        .status(403)
        .type("text")
        .send("You do not have access to this application.");

      return;
    }

    req.log.error({ err: error }, "Unable to complete Microsoft sign-in");

    res
      .status(503)
      .type("text")
      .send("Sign-in could not be completed. Please try again.");
  }
});

router.get("/me", requireLogin, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(req.session.user);
});

/**
 * Called only by the embedded authentication popup.
 *
 * The popup tells the Workspace that Production Priority authentication
 * has completed successfully, then closes itself.
 */
router.get("/embedded-complete", (req, res) => {
  const workspaceOrigin =
    process.env.WORKSPACE_FRONTEND_URL?.trim();

  if (!workspaceOrigin) {
    res
      .status(500)
      .type("text")
      .send("WORKSPACE_FRONTEND_URL is not configured.");

    return;
  }

res.type("html").send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Authentication complete</title>
</head>
<body>
  <script>
    const workspaceOrigin = ${JSON.stringify(workspaceOrigin)};

    if (window.opener) {
      window.opener.postMessage(
        { type: "PRODUCTION_PRIORITY_AUTH_COMPLETE" },
        workspaceOrigin
      );

      window.close();
    }
  </script>

  <p>Authentication complete. You can close this window.</p>
</body>
</html>
  `);
});

router.post("/logout", (req, res, next) => {
  const origin = getApplicationOrigin();

  if (req.get("origin") !== origin) {
    res.status(403).json({ message: "Invalid request origin" });
    return;
  }

  const tenant =
    process.env.ENTRA_TENANT_ID?.trim() ||
    process.env.TENANT_ID?.trim() ||
    "common";

  const logoutUrl = new URL(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`,
  );

  logoutUrl.searchParams.set(
    "post_logout_redirect_uri",
    origin,
  );

  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      path: "/",
    });

    res.redirect(logoutUrl.toString());
  });
});

export default router;
