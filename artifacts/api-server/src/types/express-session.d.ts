import "express-session";

export type ApplicationRole = "viewer" | "editor";

export interface SessionUser {
  entraOid: string;
  email: string;
  displayName: string;
  role: ApplicationRole;
}

declare module "express-session" {
  interface SessionData {
    authState?: string;
    returnTo?: string;
    user?: SessionUser;
    authorizationCheckedAt?: number;
  }
}