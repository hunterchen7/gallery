import type { Collection, Photo } from "~/db/schema";
import {
  collectionSnapshotKey,
  loadCollectionFromNeon,
  loadPublicCollectionsFromNeon,
  PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
} from "~/lib/collection-source";
import {
  beginSnapshotMutation,
  completeSnapshotMutation,
  publishSnapshot,
} from "~/lib/d1-snapshot-store";

export interface CollectionSnapshot extends Collection {
  photos: Array<Photo & { order: number }>;
}

interface DurableObjectStubLike {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

interface CloudflareEnv {
  COLLECTION_CACHE?: DurableObjectNamespaceLike;
}

const LOCAL_CACHE_ORIGIN = "http://127.0.0.1:8787";

type CacheReadResult =
  | {
      status: "available";
      collection: CollectionSnapshot | null;
      cacheStatus: string;
    }
  | { status: "unavailable" };

function getNamespace(): DurableObjectNamespaceLike | undefined {
  return (
    globalThis as typeof globalThis & {
      __env__?: CloudflareEnv;
    }
  ).__env__?.COLLECTION_CACHE;
}

function getStub(collectionId: string): DurableObjectStubLike | null {
  const namespace = getNamespace();
  if (namespace) return namespace.get(namespace.idFromName(collectionId));

  if (import.meta.env.DEV) {
    return {
      fetch(input, init) {
        const internalUrl = new URL(input.toString());
        return fetch(
          `${LOCAL_CACHE_ORIGIN}${internalUrl.pathname}${internalUrl.search}`,
          init,
        );
      },
    };
  }

  return null;
}

function collectionUrl(collectionId: string) {
  return `https://collection-cache.internal/collections/${encodeURIComponent(collectionId)}`;
}

export async function readCollectionCache(
  collectionId: string,
): Promise<CacheReadResult> {
  const stub = getStub(collectionId);
  if (!stub) return { status: "unavailable" };

  try {
    const response = await stub.fetch(collectionUrl(collectionId));
    const cacheStatus = response.headers.get("X-Collection-Cache") ?? "UNKNOWN";

    if (response.status === 404) {
      return { status: "available", collection: null, cacheStatus };
    }
    if (!response.ok) {
      console.error("Collection cache read failed:", response.status);
      return { status: "unavailable" };
    }

    return {
      status: "available",
      collection: (await response.json()) as CollectionSnapshot,
      cacheStatus,
    };
  } catch (error) {
    console.error("Collection cache read failed:", error);
    return { status: "unavailable" };
  }
}

/**
 * Marks a collection dirty before its Neon mutation begins. If the binding is
 * configured, failure is fatal so a write can never leave a stale clean cache.
 */
export async function invalidateCollectionCache(collectionId: string) {
  const stub = getStub(collectionId);
  if (!stub) return null;

  const response = await stub.fetch(collectionUrl(collectionId), {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Collection cache invalidation failed (${response.status})`);
  }
  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error("Collection cache invalidation returned no mutation token");
  }
  return body.token;
}

/**
 * Completes one mutation and lets the DO rebuild once all overlapping writes
 * finish. If rebuilding fails, the old snapshot remains absent.
 */
export async function refreshCollectionCache(
  collectionId: string,
  mutationToken: string,
) {
  const stub = getStub(collectionId);
  if (!stub) return false;

  try {
    const response = await stub.fetch(collectionUrl(collectionId), {
      method: "PUT",
      headers: { "X-Cache-Mutation-Token": mutationToken },
    });
    if (!response.ok) {
      console.error("Collection cache refresh failed:", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Collection cache refresh failed:", error);
    return false;
  }
}

export async function withCollectionCacheRefresh<T>(
  collectionIds: Iterable<string>,
  mutation: () => Promise<T>,
  options: { includePublicCollections?: boolean } = {},
): Promise<T> {
  const uniqueIds = [...new Set(collectionIds)].filter(Boolean);
  const invalidated = new Map<string, string>();
  const snapshotKeys = uniqueIds.map(collectionSnapshotKey);
  if (options.includePublicCollections) {
    snapshotKeys.push(PUBLIC_COLLECTIONS_SNAPSHOT_KEY);
  }
  const snapshotMutations = new Map<string, string>();

  const finishSnapshotMutations = async () => {
    const readyToRefresh = (
      await Promise.all(
        [...snapshotMutations].map(async ([cacheKey, token]) => ({
          cacheKey,
          completion: await completeSnapshotMutation(cacheKey, token),
        })),
      )
    ).filter(
      (result) => result.completion.status === "refresh",
    ) as Array<{
      cacheKey: string;
      completion: { status: "refresh"; generation: number };
    }>;

    await Promise.all(
      readyToRefresh.map(async ({ cacheKey, completion }) => {
        const payload =
          cacheKey === PUBLIC_COLLECTIONS_SNAPSHOT_KEY
            ? await loadPublicCollectionsFromNeon()
            : await loadCollectionFromNeon(
                cacheKey.slice("collection:".length),
              );
        await publishSnapshot(cacheKey, payload, completion.generation);
      }),
    );
  };

  const finishDurableMutations = () =>
    Promise.all(
      [...invalidated].map(([id, token]) =>
        refreshCollectionCache(id, token),
      ),
    );

  try {
    for (const cacheKey of snapshotKeys) {
      const token = await beginSnapshotMutation(cacheKey);
      if (token) snapshotMutations.set(cacheKey, token);
    }

    for (const collectionId of uniqueIds) {
      const token = await invalidateCollectionCache(collectionId);
      if (token) {
        invalidated.set(collectionId, token);
      }
    }
  } catch (error) {
    await Promise.all([finishSnapshotMutations(), finishDurableMutations()]);
    throw error;
  }

  try {
    return await mutation();
  } finally {
    await Promise.all([finishSnapshotMutations(), finishDurableMutations()]);
  }
}
