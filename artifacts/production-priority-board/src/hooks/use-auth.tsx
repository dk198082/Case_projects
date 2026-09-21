import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { set401Handler } from "@workspace/api-client-react";

export type AuthUser = {
  entraOid: string;
  email: string;
  displayName: string;
  role: "viewer" | "editor";
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  refresh: () => Promise<void>;
  beginLogin: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const isAuthUser = (value: unknown): value is AuthUser => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.entraOid === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.displayName === "string" &&
    (candidate.role === "viewer" || candidate.role === "editor")
  );
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const becomeUnauthenticated = useCallback(() => {
    setUser(null);
    setStatus("unauthenticated");
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (response.status === 401) {
        becomeUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error(`Session check failed with HTTP ${response.status}.`);
      }

      const nextUser: unknown = await response.json();
      if (!isAuthUser(nextUser)) {
        throw new Error("The server returned an invalid session.");
      }

      setUser(nextUser);
      setStatus("authenticated");
    } catch (cause) {
      setUser(null);
      setStatus("unauthenticated");
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to check your sign-in.",
      );
    }
  }, [becomeUnauthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    set401Handler(becomeUnauthenticated);
    return () => set401Handler(null);
  }, [becomeUnauthenticated]);

  const beginLogin = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const loginUrl = `/api/login?returnTo=${encodeURIComponent(returnTo)}`;
    const embedded = window.top !== window.self;

    if (embedded) {
      const opened = window.open(loginUrl, "_blank", "noopener");
      if (!opened) {
        setError("Your browser blocked the sign-in tab. Open the app in a new tab and try again.");
      }
      return;
    }

    window.location.assign(loginUrl);
  }, []);

  const value = useMemo(
    () => ({ user, status, error, refresh, beginLogin }),
    [user, status, error, refresh, beginLogin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}