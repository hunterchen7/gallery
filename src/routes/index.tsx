import { Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { Gallery, type GalleryPhoto } from "~/components/photos/GalleryV2";
import { getPublicCollectionPage } from "~/lib/collection-query";

export const route = {
  preload: () => getPublicCollectionPage("highlights"),
} satisfies RouteDefinition;

export default function Index() {
  const collection = createAsync(
    () => getPublicCollectionPage("highlights"),
    { deferStream: true },
  );

  const photos = (): GalleryPhoto[] =>
    collection()?.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      thumbnail: photo.thumbnail,
      width: photo.width,
      height: photo.height,
      date: photo.date,
    })) ?? [];

  return (
    <>
      <Title>{collection()?.name ?? "Gallery"}</Title>
      <Gallery
        photos={photos()}
        caption={
          collection()?.description ||
          "a collection of some photos I took that I like :)"
        }
        currentCollectionId="highlights"
        currentCollection={collection() || undefined}
      />
    </>
  );
}
