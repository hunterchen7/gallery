/**
 * Client-side image processing utilities
 * Handles thumbnail generation and image conversion
 */

export interface ProcessedImage {
  original: Blob;
  thumbnail: Blob;
  sourceFilename: string;
  originalFilename: string;
  thumbnailFilename: string;
  originalContentType: string;
  contentHash: string;
  date: Date;
}

const THUMBNAIL_MAX_SIZE = 800;
const THUMBNAIL_QUALITY = 0.8;

/**
 * Extract EXIF date from an image file
 * Falls back to file modification date or current date
 */
async function extractImageDate(file: File): Promise<Date> {
  try {
    // Dynamic import to avoid loading on server
    const ExifReader = await import("exifreader");
    const arrayBuffer = await file.arrayBuffer();
    const tags = ExifReader.load(arrayBuffer);

    // Try various date fields
    const dateString =
      tags["DateTimeOriginal"]?.description ||
      tags["DateTime"]?.description ||
      tags["DateTimeDigitized"]?.description;

    if (dateString) {
      // EXIF date format: "YYYY:MM:DD HH:MM:SS"
      const [datePart, timePart] = dateString.split(" ");
      const [year, month, day] = datePart.split(":");
      const [hour, minute, second] = timePart?.split(":") || ["00", "00", "00"];
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
      );
    }
  } catch (error) {
    console.warn("Failed to extract EXIF date:", error);
  }

  // Fallback to file modification date or current date
  return file.lastModified ? new Date(file.lastModified) : new Date();
}

/**
 * Generate a thumbnail from an image file
 * Resizes to max 800x800 and converts to WebP
 */
async function generateThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Failed to get canvas context"));
      return;
    }

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      if (width > THUMBNAIL_MAX_SIZE || height > THUMBNAIL_MAX_SIZE) {
        const scale = Math.min(
          THUMBNAIL_MAX_SIZE / width,
          THUMBNAIL_MAX_SIZE / height,
        );
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and convert to WebP
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to generate thumbnail"));
          }
        },
        "image/webp",
        THUMBNAIL_QUALITY,
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate thumbnail filename from original filename
 * e.g., "HC_08466.jpg" -> "HC_08466-thumb.webp"
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function calculateContentHash(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Process an image file for upload
 * Generates thumbnail and extracts metadata
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const [thumbnail, date, contentHash] = await Promise.all([
    generateThumbnail(file),
    extractImageDate(file),
    calculateContentHash(file),
  ]);

  return {
    original: file,
    thumbnail,
    sourceFilename: file.name,
    originalFilename: `photos/${contentHash}`,
    thumbnailFilename: `thumbnails/${contentHash}.webp`,
    originalContentType: file.type || "application/octet-stream",
    contentHash,
    date,
  };
}

/**
 * Process multiple images in parallel
 */
export async function processImages(files: File[]): Promise<ProcessedImage[]> {
  return Promise.all(files.map(processImage));
}
