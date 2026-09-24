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

import {
  verifyEmbeddedSsoToken,
} from "../lib/embedded-sso";

import { SESSION_COOKIE_NAME } from "../lib/session";
import { requireLogin } from "../middleware/auth";

const router: IRouter = Router();

declare module "express-session" {
  interface SessionData {
    embeddedLogin?: boolean;
  }
}

const saveSession = (
  session: Express.Request["session"],
) =>
  new Promise<void>((resolve, reject) => {
    session.save((error) =>
      error ? reject(error) : resolve(),
    );
  });

const regenerateSession = (
  session: Express.Request["session"],
) =>
  new Promise<void>((resolve, reject) => {
    session.regenerate((error) =>
      error ? reject(error) : resolve(),
    );
  });

/**
 * Normal Microsoft Login
 *
 * This remains available when the application
 * is opened directly.
 */
router.get("/login", async (req, res, next) => {
  try {
    const embeddedLogin =
      req.query.embedded === "1";

    req.session.embeddedLogin =
      embeddedLogin;

    /*
     * Existing authenticated session.
     */
    if (
      embeddedLogin &&
      req.session.user
    ) {
      res.redirect("/");
      return;
    }

    const state = createAuthState();

    req.session.authState = state;

    req.session.returnTo =
      sanitizeReturnTo(
        req.query.returnTo,
      );

    await saveSession(req.session);

    const authUrl =
      await msalClient.getAuthCodeUrl({
        scopes: AUTH_SCOPES,

        redirectUri:
          getRedirectUri(req),

        state,

        prompt: "select_account",
      });

    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * NEW
 *
 * Workspace -> Production Priority
 *
 * This route does NOT open Microsoft login.
 *
 * Workspace sends a short-lived signed SSO
 * token. Production Priority verifies it,
 * checks Admin Console authorization, creates
 * its own session and redirects to the app.
 */
router.get(
  "/embedded-sso",
  async (req, res): Promise<void> => {
    const token =
      typeof req.query.token === "string"
        ? req.query.token
        : "";

    const returnTo =
      typeof req.query.returnTo === "string"
        ? req.query.returnTo
        : "/";

    req.log.info(
      {
        hasToken: Boolean(token),
        returnTo,
      },
      "Production Priority embedded SSO started",
    );

    if (!token) {
      res
        .status(400)
        .type("text")
        .send("Missing SSO token.");

      return;
    }

    const identity =
      verifyEmbeddedSsoToken(
        token,
        "production-priority-board",
      );

    if (!identity) {
      req.log.warn(
        "Production Priority embedded SSO token invalid or expired",
      );

      res
        .status(401)
        .type("text")
        .send(
          "Invalid or expired SSO token.",
        );

      return;
    }

    try {
      /*
       * Admin Console remains the source of
       * application authorization.
       */
      const role =
        await checkAdminConsoleAccess(
          identity.sub,
        );

      /*
       * Create the same session user structure
       * used by normal Microsoft authentication.
       */
      const user = getSessionUser(
        {
          oid: identity.sub,
          email: identity.email,
          name: identity.name,
        },
        role,
      );

      /*
       * Create a fresh Production Priority
       * session.
       */
      await regenerateSession(
        req.session,
      );

      req.session.user = user;

      req.session.authorizationCheckedAt =
        Date.now();

      await saveSession(
        req.session,
      );

      req.log.info(
        {
          entraOid: identity.sub,
          role,
          sessionId: req.sessionID,
        },
        "Production Priority embedded session created",
      );

      const safeReturnTo =
        returnTo.startsWith("/") &&
        !returnTo.startsWith("//") &&
        !returnTo.includes("\\")
          ? returnTo
          : "/";

      res.redirect(safeReturnTo);
    } catch (error) {
      if (
        error instanceof
        AdminConsoleAccessDeniedError
      ) {
        req.log.warn(
          {
            denialType:
              error.denialType,

            returnedRoles:
              error.returnedRoles,
          },
          "Production Priority embedded SSO access denied",
        );

        res
          .status(403)
          .type("text")
          .send(
            "You do not have access to this application.",
          );

        return;
      }

      req.log.error(
        {
          err: error,
        },
        "Production Priority embedded SSO failed",
      );

      res
        .status(503)
        .type("text")
        .send(
          "Embedded sign-in could not be completed.",
        );
    }
  },
);

/**
 * Normal Microsoft OAuth callback
 */
router.get(
  "/callback",
  async (req, res) => {
    const code =
      typeof req.query.code === "string"
        ? req.query.code
        : "";

    const state =
      typeof req.query.state === "string"
        ? req.query.state
        : "";

    const expectedState =
      req.session.authState;

    const embeddedLogin =
      req.session.embeddedLogin === true;

    delete req.session.authState;

    delete req.session.embeddedLogin;

    if (
      !code ||
      !state ||
      !expectedState ||
      state !== expectedState
    ) {
      res
        .status(400)
        .type("text")
        .send(
          "Invalid or expired sign-in request.",
        );

      return;
    }

    try {
      const result =
        await msalClient.acquireTokenByCode({
          code,

          scopes: AUTH_SCOPES,

          redirectUri:
            getRedirectUri(req),
        });

      const claims =
        (result.idTokenClaims ||
          {}) as Record<
          string,
          unknown
        >;

      const entraOid =
        typeof claims.oid === "string"
          ? claims.oid.trim()
          : "";

      if (!entraOid) {
        throw new Error(
          "Microsoft Entra did not return the user's Object ID.",
        );
      }

      const role =
        await checkAdminConsoleAccess(
          entraOid,
        );

      const user =
        getSessionUser(
          claims,
          role,
        );

      const returnTo =
        sanitizeReturnTo(
          req.session.returnTo,
        );

      await regenerateSession(
        req.session,
      );

      req.session.user =
        user;

      req.session.authorizationCheckedAt =
        Date.now();

      req.session.embeddedLogin =
        embeddedLogin;

      await saveSession(
        req.session,
      );

      /*
       * Old popup-based embedded login.
       *
       * We keep this temporarily so we don't
       * break any existing direct usage.
       *
       * Workspace's NEW SSO flow does not use it.
       */
      if (embeddedLogin) {
        res.redirect("/");
        return;
      }

      res.redirect(returnTo);
    } catch (error) {
      if (
        error instanceof
        AdminConsoleAccessDeniedError
      ) {
        req.log.warn(
          {
            denialType:
              error.denialType,

            returnedRoles:
              error.returnedRoles,
          },
          "Production Priority denied application access",
        );

        res
          .status(403)
          .type("text")
          .send(
            "You do not have access to this application.",
          );

        return;
      }

      req.log.error(
        {
          err: error,
        },
        "Unable to complete Microsoft sign-in",
      );

      res
        .status(503)
        .type("text")
        .send(
          "Sign-in could not be completed. Please try again.",
        );
    }
  },
);

/**
 * Current user
 */
router.get(
  "/me",
  requireLogin,
  (req, res) => {
    res.set(
      "Cache-Control",
      "no-store",
    );

    res.json(
      req.session.user,
    );
  },
);

/**
 * Legacy embedded-complete endpoint.
 *
 * Workspace's NEW embedded SSO flow does
 * not use this anymore.
 *
 * Keeping it temporarily avoids breaking
 * older clients/code.
 */
router.get(
  "/embedded-complete",
  (req, res) => {
    const workspaceOrigin =
      process.env.WORKSPACE_FRONTEND_URL?.trim();

    if (!workspaceOrigin) {
      res
        .status(500)
        .type("text")
        .send(
          "WORKSPACE_FRONTEND_URL is not configured.",
        );

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
    const workspaceOrigin =
      ${JSON.stringify(workspaceOrigin)};

    if (window.opener) {
      window.opener.postMessage(
        {
          type:
            "PRODUCTION_PRIORITY_AUTH_COMPLETE"
        },
        workspaceOrigin
      );

      window.close();
    }
  </script>

  <p>
    Authentication complete.
    You can close this window.
  </p>
</body>
</html>
    `);
  },
);

/**
 * Logout
 */
router.post(
  "/logout",
  (req, res, next) => {
    const origin =
      getApplicationOrigin();

    if (
      req.get("origin") !== origin
    ) {
      res
        .status(403)
        .json({
          message:
            "Invalid request origin",
        });

      return;
    }

    const tenant =
      process.env.ENTRA_TENANT_ID?.trim() ||
      process.env.TENANT_ID?.trim() ||
      "common";

    const logoutUrl =
      new URL(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/logout`,
      );

    logoutUrl.searchParams.set(
      "post_logout_redirect_uri",
      origin,
    );

    req.session.destroy(
      (error) => {
        if (error) {
          next(error);
          return;
        }

        res.clearCookie(
          SESSION_COOKIE_NAME,
          {
            path: "/",
          },
        );

        res.redirect(
          logoutUrl.toString(),
        );
      },
    );
  },
);

export default router;