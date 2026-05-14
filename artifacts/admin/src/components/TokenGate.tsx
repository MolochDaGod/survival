import { useState, type FormEvent } from "react";
import { setAdminToken, notifyAdminTokenChanged } from "../lib/auth";

export function TokenGate() {
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Token cannot be empty");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/prefabs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${trimmed}`,
        },
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        setError("Token rejected by server.");
        return;
      }
      // 400 (validation failure) means auth passed — token is good.
      setAdminToken(trimmed);
      notifyAdminTokenChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <img
            src="/grudges-logo.png"
            alt="Grudges"
            className="h-12 w-12 object-contain drop-shadow"
          />
          <h1 className="text-xl font-semibold text-zinc-100">
            Grudges Admin
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          Paste the bearer token from{" "}
          <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">
            .local/.admin_token
          </code>{" "}
          (or your <code>ADMIN_TOKEN</code> secret).
        </p>
        <input
          type="password"
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="bearer token"
          className="mt-4 block w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
        />
        {error && (
          <p className="mt-2 text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
