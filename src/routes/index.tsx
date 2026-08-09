import { Title } from "@solidjs/meta";
import { createSignal, onMount } from "solid-js";
import { Gallery, type GalleryPhoto } from "~/components/photos/GalleryV2";

interface CollectionWithPhotos {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  photos: Array<{
    id: string;
    url: string;
    thumbnail: string;
    width: number | null;
    height: number | null;
    date: string;
  }>;
}

export default function Index() {
  const [photos, setPhotos] = createSignal<GalleryPhoto[]>([]);
  const [collection, setCollection] =
    createSignal<CollectionWithPhotos | null>(null);
  const [isLoading, setIsLoading] = createSignal(true);

  onMount(async () => {
    try {
      const res = await fetch("/api/collections/highlights");
      if (res.ok) {
        const data: CollectionWithPhotos = await res.json();
        setCollection(data);
        setPhotos(
          data.photos.map((p) => ({
            id: p.id,
            url: p.url,
            thumbnail: p.thumbnail,
            width: p.width,
            height: p.height,
            date: p.date,
          })),
        );
      }
    } catch {
      // Keep using fallback manifest
    }
    setIsLoading(false);
  });

  return (
    <>
      <Title>Gallery</Title>
      <Gallery
        photos={photos()}
        caption="a collection of some photos I took that I like :)"
        currentCollectionId="highlights"
        currentCollection={collection() || undefined}
      />
    </>
  );
}
