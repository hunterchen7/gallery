import { query } from "@solidjs/router";
import { loadPublicCollectionRoute } from "~/lib/collection-data";

export const getPublicCollectionRoute = query(async (id: string) => {
  "use server";

  return loadPublicCollectionRoute(id);
}, "public-collection-route");
