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

router.get("/auth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const expectedState = req.session.authState;

  delete req.session.authState;

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
    await saveSession(req.session);

    res.redirect(returnTo);
  } catch (error) {
    if (error instanceof AdminConsoleAccessDeniedError) {
      req.log.warn(
        {
          denialType: error.denialType,
          returnedRoles: error.returnedRoles,
        },
        "Admin Console denied application access",
      );
      res.status(403).type("text").send("You do not have access to this application.");
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

router.post("/logout", (req, res, next) => {
  const origin = getApplicationOrigin();
  if (req.get("origin") !== origin) {
    res.status(403).json({ message: "Invalid request origin" });
    return;
  }

  const logoutUrl = new URL(
    `https://login.microsoftonline.com/${
      process.env.ENTRA_TENANT_ID?.trim() ||
      process.env.TENANT_ID?.trim() ||
      "common"
    }/oauth2/v2.0/logout`,
  );
  logoutUrl.searchParams.set("post_logout_redirect_uri", origin);

  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }

    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.redirect(logoutUrl.toString());
  });
});

export default router;