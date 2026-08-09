/**
 * Shared photo types for use across the application
 * This bridges the database schema and the frontend components
 */

export interface GalleryPhoto {
  id: string;
  url: string;
  thumbnail: string;
  width: number | null;
  height: number | null;
  date: string;
}

export const S3_PREFIX = "https://photos.hunterchen.ca/";
