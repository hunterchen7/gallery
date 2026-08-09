import { query } from "@solidjs/router";
import {
  loadCollectionPage,
  loadPublicCollections,
} from "~/lib/collection-data";

export const getPublicCollectionPage = query(async (id: string) => {
  "use server";

  return (await loadCollectionPage(id)).collection;
}, "public-collection-page");

export const getPublicCollectionsPage = query(async () => {
  "use server";

  return loadPublicCollections();
}, "public-collections-page");
