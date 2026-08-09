import { Meta, Title } from "@solidjs/meta";
import {
  createAsync,
  type RouteDefinition,
  useParams,
} from "@solidjs/router";
import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Gallery, type GalleryPhoto } from "~/components/photos/GalleryV2";
import { getStoredAuthKey } from "~/lib/auth";
import type { CollectionPageData } from "~/lib/collection-data";
import { getPublicCollectionPage } from "~/lib/collection-query";

export const route = {
  preload: ({ params }) => getPublicCollectionPage(params.id),
} satisfies RouteDefinition;

export default function CollectionPage() {
  const params = useParams();
  const publicCollection = createAsync(
    () => getPublicCollectionPage(params.id),
    { deferStream: true },
  );
  const [adminCollection, setAdminCollection] =
    createSignal<CollectionPageData>();
  const [adminCheckComplete, setAdminCheckComplete] = createSignal(false);

  // Public route data is loaded before the route is committed. Private
  // collections require the browser-only admin key, so preserve that one
  // authenticated fallback without making every public page fetch twice.
  createEffect(() => {
    const id = params.id;
    const loadedCollection = publicCollection();
    if (typeof window === "undefined" || loadedCollection === undefined) return;

    setAdminCollection(undefined);
    if (loadedCollection !== null) {
      setAdminCheckComplete(true);
      return;
    }

    const authKey = getStoredAuthKey();
    if (!authKey) {
      setAdminCheckComplete(true);
      return;
    }

    const controller = new AbortController();
    setAdminCheckComplete(false);
    void fetch(`/api/collections/${id}`, {
      headers: { "X-Auth-Key": authKey },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.ok) {
          setAdminCollection((await response.json()) as CollectionPageData);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAdminCheckComplete(true);
      });

    onCleanup(() => controller.abort());
  });

  const collection = () => adminCollection() ?? publicCollection();
  const notFound = () =>
    publicCollection() === null &&
    adminCheckComplete() &&
    adminCollection() === undefined;

  const photos = (): GalleryPhoto[] =>
    collection()?.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      thumbnail: photo.thumbnail,
      width: photo.width,
      height: photo.height,
      date: photo.date,
    })) ?? [];

  const previewImage = () => {
    const photo = collection()?.photos[0];
    return photo ? `https://photos.hunterchen.ca/${photo.url}` : undefined;
  };

  return (
    <>
      <Show when={collection()}>
        {(data) => (
          <>
            <Title>{data().name} - Gallery</Title>
            <Meta property="og:title" content={data().name} />
            <Show when={data().description}>
              <Meta property="og:description" content={data().description!} />
            </Show>
            <Meta property="og:type" content="website" />
            <Show when={previewImage()}>
              <Meta property="og:image" content={previewImage()!} />
              <Meta property="og:image:alt" content={`${data().name} photo`} />
              <Meta name="twitter:card" content="summary_large_image" />
              <Meta name="twitter:title" content={data().name} />
              <Show when={data().description}>
                <Meta
                  name="twitter:description"
                  content={data().description!}
                />
              </Show>
              <Meta name="twitter:image" content={previewImage()!} />
            </Show>
          </>
        )}
      </Show>

      <Gallery
        photos={photos()}
        caption={
          <Show
            when={collection()}
            fallback={
              <Show when={notFound()}>
                <div class="py-8 text-center">
                  <h2 class="mb-2 text-xl">Collection not found</h2>
                </div>
              </Show>
            }
          >
            {(data) => data().description || data().name}
          </Show>
        }
        currentCollectionId={collection()?.id}
        currentCollection={collection() || undefined}
      />
    </>
  );
}
