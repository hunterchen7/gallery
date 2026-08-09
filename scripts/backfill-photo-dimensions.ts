import "dotenv/config";
import { eq, isNull, or } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { getR2Object } from "../src/lib/r2";

interface Options {
  apply: boolean;
  concurrency: number;
}

interface Dimensions {
  width: number;
  height: number;
}

function parseOptions(args: string[]): Options | null {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: npm run backfill:dimensions -- [options]

Reads legacy thumbnails and fills photos.width and photos.height. No photos or
R2 objects are changed or deleted.

Options:
  --apply              Write dimensions. Without this flag, run read-only.
  --concurrency <n>    Concurrent thumbnail reads (default: 4, maximum: 12).
  --help               Show this help.`);
    return null;
  }

  const inline = args.find((arg) => arg.startsWith("--concurrency="));
  const index = args.indexOf("--concurrency");
  const concurrency = Number(
    inline?.split("=")[1] ?? (index >= 0 ? args[index + 1] : 4),
  );
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
    throw new Error("--concurrency must be an integer between 1 and 12");
  }
  return { apply: args.includes("--apply"), concurrency };
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function parseWebp(bytes: Uint8Array, view: DataView): Dimensions | null {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const data = offset + 8;

    if (type === "VP8X" && data + 10 <= bytes.length) {
      return {
        width: uint24le(bytes, data + 4) + 1,
        height: uint24le(bytes, data + 7) + 1,
      };
    }
    if (type === "VP8L" && data + 5 <= bytes.length && bytes[data] === 0x2f) {
      const packed = view.getUint32(data + 1, true);
      return {
        width: (packed & 0x3fff) + 1,
        height: ((packed >>> 14) & 0x3fff) + 1,
      };
    }
    if (
      type === "VP8 " &&
      data + 10 <= bytes.length &&
      bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 &&
      bytes[data + 5] === 0x2a
    ) {
      return {
        width: view.getUint16(data + 6, true) & 0x3fff,
        height: view.getUint16(data + 8, true) & 0x3fff,
      };
    }

    offset = data + size + (size % 2);
  }
  return null;
}

function parseJpeg(bytes: Uint8Array, view: DataView): Dimensions | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
    0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) break;
    if (startOfFrame.has(marker) && length >= 7) {
      return {
        height: view.getUint16(offset + 3, false),
        width: view.getUint16(offset + 5, false),
      };
    }
    offset += length;
  }
  return null;
}

function parseDimensions(buffer: ArrayBuffer): Dimensions {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const webp = bytes.length >= 30 ? parseWebp(bytes, view) : null;
  if (webp) return webp;

  if (bytes.length >= 24 && ascii(bytes, 1, 3) === "PNG") {
    return {
      width: view.getUint32(16, false),
      height: view.getUint32(20, false),
    };
  }

  if (bytes.length >= 10 && ascii(bytes, 0, 3) === "GIF") {
    return {
      width: view.getUint16(6, true),
      height: view.getUint16(8, true),
    };
  }

  const jpeg = bytes.length >= 4 ? parseJpeg(bytes, view) : null;
  if (jpeg) return jpeg;
  throw new Error("Unsupported or invalid thumbnail format");
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<void>,
) {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (!options) return;

  const photos = await getDb().query.photos.findMany({
    where: or(isNull(schema.photos.width), isNull(schema.photos.height)),
    orderBy: (photos, { asc }) => [asc(photos.createdAt), asc(photos.id)],
  });
  console.log(
    `${options.apply ? "APPLY" : "DRY RUN"}: ${photos.length} photo(s) need dimensions.`,
  );

  let updated = 0;
  const failures: Array<{ id: string; thumbnail: string; error: string }> = [];
  await mapWithConcurrency(
    photos,
    options.concurrency,
    async (photo, index) => {
      try {
        const response = await getR2Object(photo.thumbnail);
        if (!response.ok) {
          throw new Error(`R2 returned ${response.status}`);
        }
        const dimensions = parseDimensions(await response.arrayBuffer());
        if (dimensions.width <= 0 || dimensions.height <= 0) {
          throw new Error("Thumbnail has invalid dimensions");
        }
        console.log(
          `[${index + 1}/${photos.length}] ${photo.thumbnail} -> ${dimensions.width}x${dimensions.height}`,
        );
        if (options.apply) {
          await getDb()
            .update(schema.photos)
            .set(dimensions)
            .where(eq(schema.photos.id, photo.id));
          updated++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push({
          id: photo.id,
          thumbnail: photo.thumbnail,
          error: message,
        });
        console.error(
          `[${index + 1}/${photos.length}] FAILED ${photo.thumbnail}: ${message}`,
        );
      }
    },
  );

  console.log(
    `\n${options.apply ? `Applied ${updated} update(s)` : "Dry run complete"}; ${failures.length} failure(s).`,
  );
  if (!options.apply && photos.length > 0) {
    console.log("Re-run with --apply to write the dimensions.");
  }
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
