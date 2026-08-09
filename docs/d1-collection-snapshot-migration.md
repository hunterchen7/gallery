# D1 collection snapshot migration

Neon remains the source of truth for collections, photos, and collection-photo
relationships. D1 replaces the per-collection Durable Object cache with a small
set of serialized route snapshots.

## Response contract

A direct request for `/` or `/:collectionId` does not stream the gallery shell
before its route snapshot is available. The Worker reads the current collection
and public collection navigation from D1, embeds both values in the initial HTML,
and then sends the response. The browser does not fetch collection metadata after
the page appears.

After hydration, the browser may prefetch snapshots for other public collections.
Those deferred requests never delay the current page.

## Snapshot keys

- `collection:<id>` stores the complete collection page payload, including the
  ordered photo metadata used for the grid.
- `public-collections` stores the lightweight public collection navigation.

The payloads contain metadata only. Original images and thumbnails remain in R2.

## Invalidation contract

Before a Neon mutation begins, every affected snapshot is marked dirty and given
a mutation token. Dirty snapshots are never served. When all overlapping tokens
for a key have completed, the Worker rebuilds that snapshot from Neon and only
publishes it if no newer invalidation occurred during the rebuild.

Collection create, rename, privacy, and delete operations also invalidate
`public-collections`. Photo uploads, membership changes, and reorders invalidate
only the affected collection snapshots.

If D1 cannot be reached, reads fall back to Neon. Once D1 is configured for a
mutation, invalidation failure stops that mutation so a clean stale snapshot can
never outlive a successful Neon write.

## Rollout

1. Create the D1 database and apply its migrations while retaining the Durable
   Object binding.
2. Deploy D1 reads with Durable Object and Neon fallbacks. Cache misses backfill
   D1 from Neon.
3. Backfill all current collection and navigation snapshots, then make D1 the
   primary read path.
4. Remove the Durable Object class and binding after production reads and
   invalidations are confirmed.

Rollback during steps 1-3 is a code deploy: the Durable Object namespace and
Neon data are unchanged.
