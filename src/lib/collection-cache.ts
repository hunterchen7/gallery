import {
  collectionSnapshotKey,
  loadCollectionFromD1,
  loadPublicCollectionsFromD1,
  PUBLIC_COLLECTIONS_SNAPSHOT_KEY,
} from "~/lib/collection-source";
import {
  beginSnapshotMutation,
  completeSnapshotMutation,
  publishSnapshot,
} from "~/lib/d1-snapshot-store";

export async function withCollectionCacheRefresh<T>(
  collectionIds: Iterable<string>,
  mutation: () => Promise<T>,
  options: {
    includePublicCollections?: boolean;
    waitUntil?: (promise: Promise<void>) => void;
  } = {},
): Promise<T> {
  const uniqueIds = [...new Set(collectionIds)].filter(Boolean);
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
            ? await loadPublicCollectionsFromD1()
            : await loadCollectionFromD1(
                cacheKey.slice("collection:".length),
              );
        await publishSnapshot(cacheKey, payload, completion.generation);
      }),
    );
  };

  const mutationStarts = await Promise.allSettled(
    snapshotKeys.map(async (cacheKey) => {
      const token = await beginSnapshotMutation(cacheKey);
      if (token) snapshotMutations.set(cacheKey, token);
    }),
  );
  const failedStart = mutationStarts.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failedStart) {
    await finishSnapshotMutations();
    throw failedStart.reason;
  }

  let result: T;
  try {
    result = await mutation();
  } catch (error) {
    await finishSnapshotMutations();
    throw error;
  }

  const refreshPromise = finishSnapshotMutations();
  if (!options.waitUntil) {
    await refreshPromise;
    return result;
  }

  options.waitUntil(
    refreshPromise.catch((error) => {
      console.error("D1 snapshot refresh failed:", error);
    }),
  );
  return result;
}
