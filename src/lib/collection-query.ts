import { query } from "@solidjs/router";
import { loadCollectionPage } from "~/lib/collection-data";

export const getPublicCollectionPage = query(async (id: string) => {
  "use server";

  return (await loadCollectionPage(id)).collection;
}, "public-collection-page");
