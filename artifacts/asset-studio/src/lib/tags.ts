/**
 * Cloud-backed asset tagging.
 *
 * Tags are persisted in D1 via the API server (see
 * artifacts/api-server/src/routes/assetStudio.ts) so they survive across
 * browsers, machines, and reinstalls. The hook keeps a local mirror of the
 * map to keep the UI snappy and applies optimistic updates on every edit;
 * failed writes roll back and surface a console warning.
 *
 * Field shape mirrors the four dimensions surfaced in the editor — gear
 * slot, character form, grudge UUID, notes — plus an `updatedAt` ISO stamp
 * the server stamps on every save.
 */
import { useCallback, useMemo } from "react";
import {
  useListStudioTags,
  useUpsertStudioTag,
  useDeleteStudioTag,
  useClearStudioTags,
  getListStudioTagsQueryKey,
  type StudioTag as ApiStudioTag,
  type StudioTagMap as ApiStudioTagMap,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export type AssetTag = ApiStudioTag;
export type TagMap = Record<string, AssetTag>;

/** Returns true if every field that we care about is empty/whitespace. */
export function isTagEmpty(tag: Partial<AssetTag> | undefined): boolean {
  if (!tag) return true;
  return (
    !tag.gearSlot?.trim() &&
    !tag.characterForm?.trim() &&
    !tag.grudgeUuid?.trim() &&
    !tag.notes?.trim()
  );
}

/**
 * React hook returning the live tag map plus mutation helpers, all backed
 * by the cloud API. Mutations are optimistic — the local cache updates
 * immediately and is rolled back if the request fails.
 */
export function useTagStore(): {
  tags: TagMap;
  count: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  setTag: (key: string, value: Partial<AssetTag>) => void;
  clearTag: (key: string) => void;
  clearAll: () => void;
} {
  const qc = useQueryClient();
  const listKey = useMemo(() => getListStudioTagsQueryKey(), []);

  const { data, isLoading, isError, error } = useListStudioTags<ApiStudioTagMap>();

  const tags: TagMap = (data?.tags ?? {}) as TagMap;
  const count = data?.count ?? Object.keys(tags).length;

  const upsert = useUpsertStudioTag();
  const remove = useDeleteStudioTag();
  const clear = useClearStudioTags();

  // Optimistic helpers ----------------------------------------------------
  // We mutate the React Query cache directly so the panel reflects the
  // change instantly; on success we leave the optimistic value in place
  // (the server response uses identical shape), on failure we invalidate
  // to fall back to server truth.
  const patchCache = useCallback(
    (updater: (m: TagMap) => TagMap): ApiStudioTagMap | undefined => {
      const prev = qc.getQueryData<ApiStudioTagMap>(listKey);
      const prevTags: TagMap = (prev?.tags ?? {}) as TagMap;
      const nextTags = updater(prevTags);
      qc.setQueryData<ApiStudioTagMap>(listKey, {
        tags: nextTags,
        count: Object.keys(nextTags).length,
      });
      return prev;
    },
    [qc, listKey],
  );

  const rollback = useCallback(
    (snapshot: ApiStudioTagMap | undefined): void => {
      if (snapshot) qc.setQueryData<ApiStudioTagMap>(listKey, snapshot);
      void qc.invalidateQueries({ queryKey: listKey });
    },
    [qc, listKey],
  );

  const setTag = useCallback(
    (key: string, value: Partial<AssetTag>): void => {
      const nextUpdatedAt = new Date().toISOString();
      const snapshot = patchCache((prev) => {
        const next = { ...prev };
        const merged: AssetTag = {
          ...prev[key],
          ...value,
          updatedAt: nextUpdatedAt,
        };
        if (isTagEmpty(merged)) {
          delete next[key];
        } else {
          next[key] = merged;
        }
        return next;
      });
      // Server normalises empty fields itself, but we still send the input
      // shape verbatim so the backend can decide between upsert and delete.
      upsert.mutate(
        {
          key: encodeURIComponent(key),
          data: {
            gearSlot: value.gearSlot ?? null,
            characterForm: value.characterForm ?? null,
            grudgeUuid: value.grudgeUuid ?? null,
            notes: value.notes ?? null,
          },
        },
        {
          onError: (err) => {
            console.warn("[asset-studio] tag save failed", err);
            rollback(snapshot);
          },
          onSuccess: () => {
            // Refresh in the background so the timestamp matches the server.
            void qc.invalidateQueries({ queryKey: listKey });
          },
        },
      );
    },
    [patchCache, rollback, upsert, qc, listKey],
  );

  const clearTag = useCallback(
    (key: string): void => {
      const snapshot = patchCache((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      remove.mutate(
        { key: encodeURIComponent(key) },
        {
          onError: (err) => {
            console.warn("[asset-studio] tag delete failed", err);
            rollback(snapshot);
          },
        },
      );
    },
    [patchCache, rollback, remove],
  );

  const clearAll = useCallback((): void => {
    const snapshot = patchCache(() => ({}));
    clear.mutate(undefined, {
      onError: (err) => {
        console.warn("[asset-studio] clear-all tags failed", err);
        rollback(snapshot);
      },
    });
  }, [patchCache, rollback, clear]);

  return {
    tags,
    count,
    isLoading,
    isError,
    error: (error as Error | null) ?? null,
    setTag,
    clearTag,
    clearAll,
  };
}
