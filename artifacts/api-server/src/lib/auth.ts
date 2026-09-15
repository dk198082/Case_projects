import "dotenv/config";
import crypto from "node:crypto";
import type { Request } from "express";
import {
  ConfidentialClientApplication,
  type Configuration,
} from "@azure/msal-node";
import { z } from "zod";
import type {
  ApplicationRole,
  SessionUser,
} from "../types/express-session";

const AUTH_SCOPES = ["openid", "profile", "email"];
const DEFAULT_ADMIN_CONSOLE_APP_NAME = "Production Priority Board";

const clientId =
  process.env.ENTRA_CLIENT_ID?.trim() || process.env.CLIENT_ID?.trim();
const tenantId =
  process.env.ENTRA_TENANT_ID?.trim() || process.env.TENANT_ID?.trim();
const clientSecret =
  process.env.ENTRA_CLIENT_SECRET?.trim() || process.env.CLIENT_SECRET?.trim();

if (!clientId || !tenantId || !clientSecret) {
  throw new Error(
    "Microsoft Entra configuration is incomplete. CLIENT_ID, TENANT_ID, and CLIENT_SECRET are required.",
  );
}

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret,
  },
};

export const msalClient = new ConfidentialClientApplication(msalConfig);

const adminConsoleResponseSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().nullable(),
  roles: z.array(z.string()),
});

export class AdminConsoleAccessDeniedError extends Error {
  constructor(
    reason: string | null,
    readonly denialType:
      | "admin-console-denied"
      | "unrecognized-role" = "admin-console-denied",
    readonly returnedRoles: string[] = [],
  ) {
    super(reason || "User does not have access to this application.");
    this.name = "AdminConsoleAccessDeniedError";
  }
}

const parseSecureUrl = (
  value: string,
  variableName: string,
  allowLocalHttp = false,
): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL.`);
  }

  const isLocal =
    url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(allowLocalHttp && isLocal)) {
    throw new Error(`${variableName} must use HTTPS.`);
  }

  return url;
};

export const getAdminConsoleAppName = (): string =>
  process.env.ADMIN_CONSOLE_APP_NAME?.trim() ||
  DEFAULT_ADMIN_CONSOLE_APP_NAME;

const requiredAdminConsoleConfig = () => {
  const baseUrl = process.env.ADMIN_CONSOLE_URL?.trim();
  const apiKey = process.env.ADMIN_CONSOLE_API_KEY?.trim();

  if (!baseUrl || !apiKey) {
    throw new Error("Admin Console authorization is not configured.");
  }

  return {
    baseUrl: parseSecureUrl(baseUrl, "ADMIN_CONSOLE_URL"),
    apiKey,
    appName: getAdminConsoleAppName(),
  };
};

const claimText = (
  claims: Record<string, unknown>,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = claims[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

export const sanitizeReturnTo = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }

  return value;
};

export const createAuthState = (): string =>
  crypto.randomBytes(32).toString("hex");

export const getApplicationOrigin = (): string => {
  const configured = process.env.APP_ORIGIN?.trim();
  if (configured) {
    const url = parseSecureUrl(
      configured,
      "APP_ORIGIN",
      process.env.NODE_ENV !== "production",
    );
    return url.origin;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_ORIGIN is required in production.");
  }

  return "http://localhost:8080";
};

export const getRedirectUri = (_req?: Request): string => {
  const configured = process.env.AUTH_REDIRECT_URI?.trim();
  if (configured) {
    return parseSecureUrl(
      configured,
      "AUTH_REDIRECT_URI",
      process.env.NODE_ENV !== "production",
    ).toString();
  }

  return `${getApplicationOrigin()}/api/auth/callback`;
};

const normalizeRole = (role: string): string =>
  role.trim().replace(/\s+/g, " ").toLowerCase();

const mapApplicationRole = (
  roles: string[],
  appName: string,
): ApplicationRole => {
  const normalizedRoles = new Set(roles.map(normalizeRole));
  const normalizedAppName = normalizeRole(appName);
  const editorRoles = [
    "read / write",
    "read/write",
    `${normalizedAppName} - read / write`,
    `${normalizedAppName} - read/write`,
  ];
  const viewerRoles = [
    "read only",
    "read",
    `${normalizedAppName} - read only`,
    `${normalizedAppName} - read`,
  ];

  if (editorRoles.some((role) => normalizedRoles.has(role))) return "editor";
  if (viewerRoles.some((role) => normalizedRoles.has(role))) return "viewer";

  throw new AdminConsoleAccessDeniedError(
    "No recognized application role was returned.",
    "unrecognized-role",
    roles.map((role) => role.trim()),
  );
};

export async function checkAdminConsoleAccess(
  entraOid: string,
): Promise<ApplicationRole> {
  const { baseUrl, apiKey, appName } = requiredAdminConsoleConfig();
  const url = new URL("/api/access-check", baseUrl);
  url.searchParams.set("entraObjectId", entraOid);
  url.searchParams.set("app", appName);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Admin Console access check failed with HTTP ${response.status}.`,
    );
  }

  const parsed = adminConsoleResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Admin Console returned an invalid access response.");
  }

  if (!parsed.data.allowed) {
    throw new AdminConsoleAccessDeniedError(parsed.data.reason);
  }

  return mapApplicationRole(parsed.data.roles, appName);
}

export const getSessionUser = (
  claims: Record<string, unknown>,
  role: ApplicationRole,
): SessionUser => {
  const entraOid = claimText(claims, "oid");
  if (!entraOid) {
    throw new Error("Microsoft Entra did not return the user's Object ID.");
  }

  const email = claimText(claims, "preferred_username", "email", "upn");
  const displayName = claimText(claims, "name") || email || "Microsoft user";

  return {
    entraOid,
    email,
    displayName,
    role,
  };
};

export { AUTH_SCOPES };