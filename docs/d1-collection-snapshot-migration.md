# D1 collection snapshot migration

D1 is the source of truth for collections, photos, and collection-photo
relationships. It also replaces the former per-collection Durable Object cache
with serialized route snapshots stored beside the normalized tables in the same
database.

## Response contract

A direct request for `/` or `/:collectionId` does not stream the gallery shell
before its route snapshot is available. The Worker reads the current collection
and public collection navigation from D1, embeds both values in the initial HTML,
and then sends the response. The browser does not fetch collection metadata after
the page appears.

After hydration, the browser may prefetch snapshots for other public collections.
Those deferred requests never delay the current page.

## Snapshot keys

- `collection:<id>` stores only the collection fields required by the route
  plus ordered photo IDs, object keys, dimensions, and the EXIF/capture date
  used by the grid and lightbox. Database creation and update timestamps,
  content hashes, and the redundant returned order scalar are omitted.
- `public-collections` stores the lightweight public collection navigation.

The payloads contain metadata only. Original images and thumbnails remain in R2.
Legacy snapshots are projected to this shape before they are returned, while
their stored JSON shrinks after the next invalidation and rebuild.

## Invalidation contract

Before a relational mutation begins, every affected snapshot is marked dirty and
given a mutation token. Dirty snapshots are never served. When all overlapping
tokens for a key have completed, the Worker rebuilds that snapshot from the D1
relational tables and only publishes it if no newer invalidation occurred during
the rebuild.

Collection create, rename, privacy, and delete operations also invalidate
`public-collections`. Photo uploads, membership changes, and reorders invalidate
only the affected collection snapshots.

If a snapshot is absent or dirty, the route reads the normalized D1 tables and
repairs it before responding. An invalidation failure stops the mutation so a
clean stale snapshot can never outlive a successful relational write.

## Completed rollout

1. Created the D1 database and applied its schema migration.
2. Backfilled all normalized collection, photo, and membership records into D1.
3. Verified every row and foreign key, then made D1 authoritative.
4. Kept route snapshots as a derived, strongly invalidated read optimization.
5. Removed the former Durable Object class, binding, read fallback, and cached
   instances with the Cloudflare `v2` delete-class migration.

The pre-cutover Neon dump is retained outside the repository as a rollback
artifact; the running application no longer queries Neon.
