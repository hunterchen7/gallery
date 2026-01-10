import {
  pgTable,
  text,
  timestamp,
  uuid,
  primaryKey,
  integer,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const collections = pgTable("collections", {
  id: text("id").primaryKey(), // URL slug, e.g., "airshow"
  name: text("name").notNull(), // Display name, e.g., "Airshow ✈️"
  description: text("description"), // Optional description
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const photos = pgTable("photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull(), // R2 filename
  thumbnail: text("thumbnail").notNull(), // R2 thumbnail filename
  date: timestamp("date").notNull(), // Photo date from EXIF
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const photoCollections = pgTable(
  "photo_collections",
  {
    photoId: uuid("photo_id")
      .notNull()
      .references(() => photos.id, { onDelete: "cascade" }),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0), // Position in collection (lower = first)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.photoId, table.collectionId] }),
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
