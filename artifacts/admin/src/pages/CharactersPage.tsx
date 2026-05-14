import { useState } from "react";
import {
  useSearchPlayers,
  useDeleteCharacter,
  getSearchPlayersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type MatchField = "grudgeId" | "displayName" | "characterName";

const FIELD_LABEL: Record<MatchField, string> = {
  grudgeId: "grudge id",
  displayName: "username",
  characterName: "character name",
};

export function CharactersPage() {
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const qc = useQueryClient();
  const searchParams = { q: activeQuery ?? "", limit: 25 };
  const search = useSearchPlayers(searchParams, {
    query: {
      queryKey: getSearchPlayersQueryKey(searchParams),
      enabled: !!activeQuery,
      retry: false,
      refetchOnWindowFocus: false,
    },
  });

  const deleteMut = useDeleteCharacter();

  function handleSearch(): void {
    setError(null);
    setNotice(null);
    const q = queryInput.trim();
    if (!q) {
      setError("Enter a search term (grudge id, username, or character name).");
      return;
    }
    setActiveQuery(q);
  }

  async function handleDelete(charId: string, charName: string): Promise<void> {
    if (
      !window.confirm(
        `Delete character "${charName}"? Their save data will be lost.`,
      )
    ) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await deleteMut.mutateAsync({ id: charId });
      setNotice(`Deleted ${charName} (${charId})`);
      // Re-run the search so the row disappears from the table.
      await qc.invalidateQueries({ queryKey: getSearchPlayersQueryKey(searchParams) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const results = search.data?.results ?? [];
  const returnedCount = search.data?.returnedCount ?? 0;
  const hasMore = search.data?.hasMore ?? false;

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-6 py-6">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="text-lg font-semibold text-zinc-100">
          Lookup characters by player
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Search by{" "}
          <span className="text-zinc-200">grudge id</span> (e.g.{" "}
          <code className="rounded bg-zinc-800 px-1 text-zinc-200">local-Default</code>),{" "}
          <span className="text-zinc-200">username</span> (display name), or{" "}
          <span className="text-zinc-200">character name</span>. Substring,
          case-insensitive. Email isn&apos;t stored as a separate field — for
          SSO accounts where the grudge id contains an email, search by that.
        </p>
        <div className="mt-3 flex gap-2">
          <label htmlFor="player-search" className="sr-only">
            Search players by grudge id, username, or character name
          </label>
          <input
            id="player-search"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="grudge id, username, or character name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleSearch}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Search
          </button>
        </div>

        {error && (
          <p
            className="mt-3 rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            className="mt-3 rounded border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
            role="status"
            aria-live="polite"
          >
            {notice}
          </p>
        )}
      </div>

      {activeQuery && (
        <div className="space-y-3">
          {search.isLoading && (
            <p className="text-sm text-zinc-500">Searching…</p>
          )}
          {search.isError && (
            <p
              className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300"
              role="alert"
            >
              {(search.error as Error).message}
            </p>
          )}
          {search.data && (
            <p
              className="text-xs text-zinc-500"
              role="status"
              aria-live="polite"
            >
              {returnedCount === 0
                ? `No matches for "${activeQuery}".`
                : hasMore
                  ? `Showing ${returnedCount} ${returnedCount === 1 ? "match" : "matches"} for "${activeQuery}" — more exist; refine your query.`
                  : `${returnedCount} ${returnedCount === 1 ? "match" : "matches"} for "${activeQuery}".`}
            </p>
          )}

          {results.map((r) => (
            <div
              key={r.account.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-zinc-100">
                    {r.account.displayName ?? r.account.grudgeId}
                  </h3>
                  <p className="font-mono text-xs text-zinc-400">
                    {r.account.grudgeId}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-600">
                    {r.account.id}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-zinc-500">
                    {r.characters.length}{" "}
                    {r.characters.length === 1 ? "character" : "characters"}
                  </span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(r.matchedFields as MatchField[]).map((f) => (
                      <span
                        key={f}
                        className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300"
                      >
                        {FIELD_LABEL[f] ?? f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {r.characters.length === 0 ? (
                <p className="text-sm text-zinc-500">No characters yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="py-1.5">Name</th>
                      <th className="py-1.5">Created</th>
                      <th className="py-1.5">Last played</th>
                      <th className="py-1.5">Save</th>
                      <th className="py-1.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.characters.map((c) => (
                      <tr
                        key={c.id}
                        className="border-t border-zinc-900 text-zinc-300"
                      >
                        <td className="py-2">
                          <div className="font-medium text-zinc-100">
                            {c.name}
                          </div>
                          <div className="font-mono text-[11px] text-zinc-500">
                            {c.id}
                          </div>
                        </td>
                        <td className="py-2 text-xs">
                          {new Date(c.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-xs">
                          {c.lastPlayedAt
                            ? new Date(c.lastPlayedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2 text-xs">
                          {c.saveData ? "yes" : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(c.id, c.name)}
                            disabled={deleteMut.isPending}
                            className="rounded border border-red-700 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
