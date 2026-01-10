import { Title, Meta } from "@solidjs/meta";
import { useParams } from "@solidjs/router";
import { createSignal, createEffect, Show } from "solid-js";
import { Gallery, type GalleryPhoto } from "~/components/photos/GalleryV2";

interface CollectionWithPhotos {
  id: string;
  name: string;
  description: string | null;
  photos: Array<{
    id: string;
    url: string;
    thumbnail: string;
    date: string;
  }>;
}

export default function CollectionPage() {
  const params = useParams();
  const [collection, setCollection] = createSignal<CollectionWithPhotos | null>(
    null,
  );
  const [loading, setLoading] = createSignal(true);
  const [notFound, setNotFound] = createSignal(false);

  // Generate a seed from the collection id for consistent shuffling
  const seed = () => {
    const id = params.id || "";
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 1000;
  };

  // Transform photos to match the gallery format
  const photos = (): GalleryPhoto[] => {
    const data = collection();
    if (!data?.photos) return [];
    return data.photos.map((p) => ({
      url: p.url,
      thumbnail: p.thumbnail,
      date: p.date,
    }));
  };

  const previewImage = () => {
    const data = collection();
    if (!data?.photos?.length) return undefined;
    return `https://photos.hunterchen.ca/${data.photos[0].url}`;
  };

  createEffect(() => {
    const id = params.id;
    setLoading(true);
    setNotFound(false);

    fetch(`/api/collections/${id}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setCollection(data);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => {
        setNotFound(true);
      })
      .finally(() => {
        setLoading(false);
      });
  });

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
            when={!loading() && collection()}
            fallback={
              <Show when={notFound()}>
                <div class="text-center py-8">
                  <h2 class="text-xl mb-2">Collection not found</h2>
                </div>
              </Show>
            }
          >
            {(data) => (
              <Show when={data().description} fallback={data().name}>
                {data().description}
              </Show>
            )}
          </Show>
        }
        currentCollectionId={collection()?.id}
        loading={loading()}
      />
    </>
  );
}
