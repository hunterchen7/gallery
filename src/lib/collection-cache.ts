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
  options: { includePublicCollections?: boolean } = {},
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

  try {
    for (const cacheKey of snapshotKeys) {
      const token = await beginSnapshotMutation(cacheKey);
      if (token) snapshotMutations.set(cacheKey, token);
    }
  } catch (error) {
    await finishSnapshotMutations();
    throw error;
  }

  try {
    return await mutation();
  } finally {
    await finishSnapshotMutations();
  }
}
