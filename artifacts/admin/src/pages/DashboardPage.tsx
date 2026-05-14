import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { adminFetch } from "../lib/adminFetch";

interface DashboardData {
  accounts:   { total: number };
  characters: { total: number };
  prefabs:    { total: number; byKind: Record<string, number> };
  assets:     { total: number; bySource: Record<string, number>; error?: string | null };
  d1: {
    available: boolean;
    cachedReason?: string | null;
    checkedAt: number;
    tokenSource: string | null;
    lastError: string | null;
  };
  serverTime: number;
}

function StatCard({
  label, value, href, hint,
}: { label: string; value: number | string; href?: string; hint?: string }) {
  const inner = (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 hover:bg-zinc-900">
      <div className="text-xs uppercase tracking-widest text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-zinc-500">{hint}</div>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function HealthDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok ? "bg-emerald-500" : "bg-rose-500"
      }`}
      aria-label={ok ? "ok" : "down"}
    />
  );
}

interface ResetResult {
  ok: true;
  accountsDeleted:   number;
  charactersDeleted: number;
  savesDeleted:      number;
  savesError:        string | null;
}

export function DashboardPage() {
  const qc = useQueryClient();
  const q = useQuery<DashboardData>({
    queryKey: ["admin", "dashboard"],
    queryFn: () => adminFetch<DashboardData>("/admin/dashboard"),
    refetchInterval: 30_000,
  });

  const [resetConfirm, setResetConfirm] = useState("");
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const resetMutation = useMutation<ResetResult, Error, void>({
    mutationFn: () =>
      adminFetch<ResetResult>("/admin/reset-demo-data", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET" }),
      }),
    onSuccess: (data) => {
      setResetResult(data);
      setResetConfirm("");
      void qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    },
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Across all games managed by this console.
          </p>
        </div>
        {q.dataUpdatedAt ? (
          <p className="text-xs text-zinc-500">
            Updated {new Date(q.dataUpdatedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>

      {q.isError ? (
        <div className="mt-6 rounded-md border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
          Failed to load: {(q.error as Error)?.message ?? "unknown"}
        </div>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Accounts
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Accounts"
            value={q.data?.accounts.total ?? "—"}
          />
          <StatCard
            label="Characters"
            value={q.data?.characters.total ?? "—"}
            href="/grudge/characters"
            hint="View per-account"
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Grudges
          </h2>
          <Link
            href="/grudge/prefabs"
            className="text-xs text-emerald-400 hover:text-emerald-300"
          >
            Open game panel →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="Prefabs"
            value={q.data?.prefabs.total ?? "—"}
            href="/grudge/prefabs"
          />
          <StatCard
            label="Assets cataloged"
            value={q.data?.assets.total ?? "—"}
            href="/grudge/assets"
            hint="Rows in D1"
          />
          <StatCard
            label="GCS-only"
            value={q.data?.assets.bySource["gcs"] ?? 0}
          />
          <StatCard
            label="Mirrored to R2"
            value={
              (q.data?.assets.bySource["r2"] ?? 0) +
              (q.data?.assets.bySource["both"] ?? 0)
            }
          />
        </div>

        {q.data && Object.keys(q.data.prefabs.byKind).length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {Object.entries(q.data.prefabs.byKind)
              .sort((a, b) => b[1] - a[1])
              .map(([kind, n]) => (
                <div
                  key={kind}
                  className="rounded-md border border-zinc-800 bg-zinc-900/30 px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                    {kind}
                  </div>
                  <div className="text-lg font-semibold text-zinc-200 tabular-nums">
                    {n}
                  </div>
                </div>
              ))}
          </div>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Infrastructure
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-center gap-2">
              <HealthDot ok={!!q.data?.d1.available} />
              <span className="font-medium text-zinc-100">
                Cloudflare D1 catalog
              </span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Status</dt>
                <dd className="text-zinc-200">
                  {q.data?.d1.available ? "Available" : "Down"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Token source</dt>
                <dd className="text-zinc-200">
                  {q.data?.d1.tokenSource ?? "—"}
                </dd>
              </div>
              {q.data?.d1.lastError ? (
                <div className="mt-2 rounded bg-rose-950/40 px-2 py-1 text-xs text-rose-200">
                  {q.data.d1.lastError}
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="font-medium text-zinc-100">Server time</div>
            <div className="mt-2 font-mono text-sm text-zinc-300">
              {q.data?.serverTime
                ? new Date(q.data.serverTime).toISOString()
                : "—"}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Danger zone
        </h2>
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-4">
          <div className="font-medium text-rose-200">Reset demo data</div>
          <p className="mt-1 text-sm text-zinc-400">
            Deletes every account, character, and cloud save. Prefabs and
            asset catalog are preserved. Useful before deploying to clear
            out test characters.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder='Type RESET to confirm'
              className="w-44 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-rose-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => resetMutation.mutate()}
              disabled={resetConfirm !== "RESET" || resetMutation.isPending}
              className="rounded border border-rose-700 bg-rose-900/40 px-3 py-1.5 text-sm font-medium text-rose-100 transition hover:bg-rose-900/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resetMutation.isPending ? "Wiping…" : "Wipe player data"}
            </button>
          </div>
          {resetMutation.isError ? (
            <div className="mt-3 rounded bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
              {resetMutation.error.message}
            </div>
          ) : null}
          {resetResult ? (
            <div className="mt-3 rounded bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
              Wiped {resetResult.accountsDeleted} account(s),{" "}
              {resetResult.charactersDeleted} character(s),{" "}
              {resetResult.savesDeleted} cloud save(s).
              {resetResult.savesError ? (
                <span className="block text-rose-300">
                  Save wipe error: {resetResult.savesError}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
