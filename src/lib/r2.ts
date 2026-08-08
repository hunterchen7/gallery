import { AwsClient } from "aws4fetch";

/**
 * R2 upload utilities using presigned URLs
 *
 * Flow:
 * 1. Authenticated client requests a presigned URL from the server
 * 2. Server generates presigned URL using R2 credentials
 * 3. Client uploads directly to R2 using the presigned URL
 */

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface R2UploadPlan {
  filename: string;
  thumbnailFilename: string;
  imageExists: boolean;
  thumbnailExists: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
}

function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || "portfolio";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

/**
 * Generate a presigned URL for uploading a file to R2
 * Uses aws4fetch which works in edge runtimes (Cloudflare Workers)
 */
export async function generatePresignedUploadUrl(
  filename: string,
  contentType: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const config = getR2Config();

  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });

  const url = new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${filename}`,
  );

  // Add query parameters for presigned URL
  url.searchParams.set("X-Amz-Expires", expiresInSeconds.toString());

  const signedRequest = await client.sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
      },
    }),
    {
      aws: { signQuery: true },
    },
  );

  return signedRequest.url;
}

/**
 * Generate presigned URLs for both the main image and thumbnail
 */
export async function generateUploadUrls(
  filename: string,
  thumbnailFilename: string,
): Promise<{ imageUrl: string; thumbnailUrl: string }> {
  const [imageUrl, thumbnailUrl] = await Promise.all([
    generatePresignedUploadUrl(filename, "image/jpeg"),
    generatePresignedUploadUrl(thumbnailFilename, "image/webp"),
  ]);

  return { imageUrl, thumbnailUrl };
}

async function objectExists(filename: string): Promise<boolean> {
  const config = getR2Config();
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const url = new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${filename}`,
  );
  const request = await client.sign(new Request(url, { method: "HEAD" }));
  const response = await fetch(request);

  if (response.ok) return true;
  if (response.status === 404) return false;
  throw new Error(`R2 existence check failed with status ${response.status}`);
}

/** Calculate the SHA-256 hash of an existing R2 object. */
export async function getObjectContentHash(filename: string): Promise<string> {
  const config = getR2Config();
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const url = new URL(
    `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucketName}/${filename}`,
  );
  const request = await client.sign(new Request(url, { method: "GET" }));
  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`R2 object download failed with status ${response.status}`);
  }

  const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build a deterministic upload plan from a SHA-256 content hash.
 * Existing objects are omitted so clients only upload missing data.
 */
export async function generateHashUploadPlan(
  contentHash: string,
  contentType: string,
): Promise<R2UploadPlan> {
  const filename = `photos/${contentHash}`;
  const thumbnailFilename = `thumbnails/${contentHash}.webp`;
  const [imageExists, thumbnailExists] = await Promise.all([
    objectExists(filename),
    objectExists(thumbnailFilename),
  ]);
  const [imageUrl, thumbnailUrl] = await Promise.all([
    imageExists
      ? Promise.resolve(undefined)
      : generatePresignedUploadUrl(filename, contentType),
    thumbnailExists
      ? Promise.resolve(undefined)
      : generatePresignedUploadUrl(thumbnailFilename, "image/webp"),
  ]);

  return {
    filename,
    thumbnailFilename,
    imageExists,
    thumbnailExists,
    imageUrl,
    thumbnailUrl,
  };
}

/**
 * Upload a file directly to R2 using a presigned URL
 * This runs on the client side
 */
export async function uploadToPresignedUrl(
  presignedUrl: string,
  file: Blob,
  contentType: string,
  onProgress?: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Upload failed"));
    });

    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(file);
  });
}
