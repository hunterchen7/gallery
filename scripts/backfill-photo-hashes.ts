import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { getObjectContentHash } from "../src/lib/r2";

interface Options {
  apply: boolean;
  concurrency: number;
}

type PhotoWithCollections = Awaited<ReturnType<typeof loadPhotos>>[number];

interface HashedPhoto {
  photo: PhotoWithCollections;
  hash: string;
}

function printUsage() {
  console.log(`Usage: npm run backfill:hashes -- [options]

Hashes legacy R2 originals and fills photos.content_hash. Identical photos are
consolidated into an existing hashed row, or otherwise the oldest database row,
while all R2 objects are retained.

Options:
  --apply              Write hashes, merge collection links, and remove only
                       redundant database photo rows. Without this flag the
                       command is a read-only dry run.
  --concurrency <n>    Concurrent R2 downloads (default: 2, maximum: 8).
  --help               Show this help.`);
}

function parseOptions(args: string[]): Options | null {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return null;
  }

  let concurrency = 2;
  const concurrencyIndex = args.indexOf("--concurrency");
  if (concurrencyIndex >= 0) {
    concurrency = Number(args[concurrencyIndex + 1]);
  }
  const inlineConcurrency = args.find((arg) =>
    arg.startsWith("--concurrency="),
  );
  if (inlineConcurrency) {
    concurrency = Number(inlineConcurrency.split("=")[1]);
  }

  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer between 1 and 8");
  }

  return { apply: args.includes("--apply"), concurrency };
}

async function loadPhotos() {
  return getDb().query.photos.findMany({
    with: { photoCollections: true },
    orderBy: (photos, { asc }) => [
      asc(photos.createdAt),
      asc(photos.id),
    ],
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

function groupByHash(photos: HashedPhoto[]) {
  const groups = new Map<string, HashedPhoto[]>();
  for (const photo of photos) {
    const group = groups.get(photo.hash) ?? [];
    group.push(photo);
    groups.set(photo.hash, group);
  }
  return groups;
}

async function mergeDuplicateIntoCanonical(
  duplicate: PhotoWithCollections,
  canonical: PhotoWithCollections,
) {
  const db = getDb();
  let linksAdded = 0;

  for (const link of duplicate.photoCollections) {
    const inserted = await db
      .insert(schema.photoCollections)
      .values({
        photoId: canonical.id,
        collectionId: link.collectionId,
        order: link.order,
      })
      .onConflictDoNothing()
      .returning({ photoId: schema.photoCollections.photoId });
    linksAdded += inserted.length;
  }

  await db.delete(schema.photos).where(eq(schema.photos.id, duplicate.id));
  return linksAdded;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;

  const photos = await loadPhotos();
  const legacyPhotos = photos.filter((photo) => !photo.contentHash);
  const alreadyHashed = photos.filter(
    (photo): photo is PhotoWithCollections & { contentHash: string } =>
      Boolean(photo.contentHash),
  );

  console.log(
    `${options.apply ? "APPLY" : "DRY RUN"}: ${photos.length} total photo(s), ` +
      `${legacyPhotos.length} legacy photo(s), ${alreadyHashed.length} already hashed.`,
  );

  const failures: Array<{ id: string; url: string; error: string }> = [];
  const hashedLegacy = await mapWithConcurrency(
    legacyPhotos,
    options.concurrency,
    async (photo, index): Promise<HashedPhoto | null> => {
      try {
        const hash = await getObjectContentHash(photo.url);
        console.log(
          `[${index + 1}/${legacyPhotos.length}] ${photo.url} -> ${hash.slice(0, 12)}…`,
        );
        return { photo, hash };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: photo.id, url: photo.url, error: message });
        console.error(
          `[${index + 1}/${legacyPhotos.length}] FAILED ${photo.url}: ${message}`,
        );
        return null;
      }
    },
  );

  const allHashed: HashedPhoto[] = [
    ...alreadyHashed.map((photo) => ({
      photo,
      hash: photo.contentHash,
    })),
    ...hashedLegacy.filter((photo): photo is HashedPhoto => photo !== null),
  ];
  const groups = groupByHash(allHashed);
  const duplicateGroups = [...groups.entries()].filter(
    ([, group]) => group.length > 1,
  );

  console.log(
    `\nPlan: ${hashedLegacy.filter(Boolean).length} hash update(s), ` +
      `${duplicateGroups.length} duplicate group(s), ` +
      `${duplicateGroups.reduce((count, [, group]) => count + group.length - 1, 0)} redundant database row(s).`,
  );

  for (const [hash, group] of duplicateGroups) {
    const [canonical, ...duplicates] = group;
    console.log(`\nDuplicate ${hash}:`);
    console.log(`  KEEP   ${canonical.photo.id}  ${canonical.photo.url}`);
    for (const duplicate of duplicates) {
      console.log(`  MERGE  ${duplicate.photo.id}  ${duplicate.photo.url}`);
    }
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} object(s) could not be hashed:`);
    for (const failure of failures) {
      console.log(`  ${failure.id}  ${failure.url}  ${failure.error}`);
    }
  }

  if (!options.apply) {
    console.log("\nDry run complete. Re-run with --apply to write these changes.");
    return;
  }

  let hashesUpdated = 0;
  let rowsMerged = 0;
  let linksAdded = 0;

  for (const [hash, group] of groups) {
    const [canonical, ...duplicates] = group;
    if (!canonical.photo.contentHash) {
      await getDb()
        .update(schema.photos)
        .set({ contentHash: hash })
        .where(eq(schema.photos.id, canonical.photo.id));
      hashesUpdated++;
    }

    for (const duplicate of duplicates) {
      linksAdded += await mergeDuplicateIntoCanonical(
        duplicate.photo,
        canonical.photo,
      );
      rowsMerged++;
    }
  }

  console.log(
    `\nApplied: ${hashesUpdated} hash(es) updated, ${rowsMerged} row(s) merged, ` +
      `${linksAdded} collection link(s) added, 0 R2 object(s) deleted.`,
  );
  if (failures.length > 0) {
    console.log("Re-run later to retry the failed objects.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
