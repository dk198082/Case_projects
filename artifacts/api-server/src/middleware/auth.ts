import type { NextFunction, Request, Response } from "express";
import type { ApplicationRole } from "../types/express-session";
import {
  AdminConsoleAccessDeniedError,
  checkAdminConsoleAccess,
} from "../lib/auth";

const AUTHORIZATION_RECHECK_MS = 5 * 60 * 1000;

const saveSession = (req: Request) =>
  new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

const destroySession = (req: Request) =>
  new Promise<void>((resolve) => {
    req.session.destroy(() => resolve());
  });

export async function requireLogin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session.user) {
    res.status(401).json({ message: "Login required" });
    return;
  }

  const lastChecked = req.session.authorizationCheckedAt || 0;
  if (Date.now() - lastChecked < AUTHORIZATION_RECHECK_MS) {
    next();
    return;
  }

  try {
    req.session.user.role = await checkAdminConsoleAccess(
      req.session.user.entraOid,
    );
    req.session.authorizationCheckedAt = Date.now();
    await saveSession(req);
    next();
  } catch (error) {
    if (error instanceof AdminConsoleAccessDeniedError) {
      req.log.warn("Admin Console revoked application access");
    } else {
      req.log.error(
        { err: error },
        "Unable to revalidate Admin Console access",
      );
    }

    await destroySession(req);
    res.status(401).json({ message: "Application access must be verified again" });
  }
}

export function requireRole(...roles: ApplicationRole[]) {
  return async function roleMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    await requireLogin(req, res, () => {
      if (!req.session.user || !roles.includes(req.session.user.role)) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      next();
    });
  };
}