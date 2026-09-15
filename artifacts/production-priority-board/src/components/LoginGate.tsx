import type { ReactNode } from "react";
import { LoaderCircle, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function LoginGate({ children }: { children: ReactNode }) {
  const { status, error, refresh, beginLogin } = useAuth();

  if (status === "authenticated") return children;

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 text-foreground">
      <section className="w-full max-w-md rounded-sm border border-border/80 bg-card/70 p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-sm border border-primary/35 bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Secure access
            </p>
            <h1 className="font-mono text-lg font-bold tracking-[0.05em] text-primary">
              PRODUCTION PRIORITY BOARD
            </h1>
          </div>
        </div>

        {status === "loading" ? (
          <div
            className="flex items-center gap-3 border-t border-border/60 pt-5 text-sm text-muted-foreground"
            role="status"
          >
            <LoaderCircle className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
            Checking your sign-in…
          </div>
        ) : (
          <div className="border-t border-border/60 pt-5">
            <p className="text-sm text-muted-foreground">
              Sign in with your company Microsoft account. Access is granted only after the Admin Console verifies your Entra user.
            </p>

            {error && (
              <div className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200" role="alert">
                {error}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={beginLogin}
                className="inline-flex items-center gap-2 rounded-sm border border-primary bg-primary px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em] text-[#00281D] transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in with Microsoft
              </button>

              {error && (
                <button
                  type="button"
                  onClick={() => void refresh()}
                  className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground hover:border-primary/50 hover:text-primary"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}