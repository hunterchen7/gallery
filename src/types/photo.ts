/**
 * Shared photo types for use across the application
 * This bridges the database schema and the frontend components
 */

export interface GalleryPhoto {
  url: string;
  thumbnail: string;
  date: string;
}

export const S3_PREFIX = "https://photos.hunterchen.ca/";
