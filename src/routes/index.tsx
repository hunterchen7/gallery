import { Title } from "@solidjs/meta";
import { createSignal, onMount } from "solid-js";
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

export default function Index() {
  const [photos, setPhotos] = createSignal<GalleryPhoto[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);

  onMount(async () => {
    try {
      const res = await fetch("/api/collections/highlights");
      if (res.ok) {
        const data: CollectionWithPhotos = await res.json();
        setPhotos(
          data.photos.map((p) => ({
            url: p.url,
            thumbnail: p.thumbnail,
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
      />
    </>
  );
}
