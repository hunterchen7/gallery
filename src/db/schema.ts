import {
  sqliteTable,
  text,
  primaryKey,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(), // URL slug, e.g., "airshow"
  name: text("name").notNull(), // Display name, e.g., "Airshow ✈️"
  description: text("description"), // Optional description
  isPrivate: integer("is_private", { mode: "boolean" })
    .default(false)
    .notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const photos = sqliteTable(
  "photos",
  {
    id: text("id")
      .$defaultFn(() => crypto.randomUUID())
      .primaryKey(),
    url: text("url").notNull(), // R2 filename
    thumbnail: text("thumbnail").notNull(), // R2 thumbnail filename
    contentHash: text("content_hash"), // SHA-256; null for legacy photos
    width: integer("width"), // Source image width; nullable for legacy rows
    height: integer("height"), // Source image height; nullable for legacy rows
    date: integer("date", { mode: "timestamp_ms" }).notNull(), // Photo date from EXIF
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => ({
    contentHashIdx: uniqueIndex("photos_content_hash_idx").on(
      table.contentHash,
    ),
  }),
);

export const photoCollections = sqliteTable(
  "photo_collections",
  {
    photoId: text("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0), // Position in collection (lower = first)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.photoId, table.collectionId] }),
    collectionOrderIdx: index(
      "photo_collections_collection_order_idx",
    ).on(table.collectionId, table.order),
  }),
);

// Relations for type-safe queries
export const collectionsRelations = relations(collections, ({ many }) => ({
  photoCollections: many(photoCollections),
}));

export const photosRelations = relations(photos, ({ many }) => ({
  photoCollections: many(photoCollections),
}));

export const photoCollectionsRelations = relations(
  photoCollections,
  ({ one }) => ({
    photo: one(photos, {
      fields: [photoCollections.photoId],
      references: [photos.id],
    }),
    collection: one(collections, {
      fields: [photoCollections.collectionId],
      references: [collections.id],
    }),
  }),
);

// Types for use throughout the app
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
export type PhotoCollection = typeof photoCollections.$inferSelect;
