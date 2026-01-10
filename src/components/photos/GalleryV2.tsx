import { createSignal, Show, JSX, onMount, For, createEffect } from "solid-js";
import { useSearchParams, A } from "@solidjs/router";
import { Photo as PhotoComponent } from "~/components/photos/Photo";
import { Carousel } from "~/components/photos/Carousel";
import { isAuthenticated } from "~/lib/auth";
import { UploadButton } from "~/components/admin/UploadButton";
import type { Collection } from "~/db/schema";
import { type GalleryPhoto } from "~/types/photo";
import { useCollections, shouldPlayAnimations } from "~/lib/galleryStore";

export { type GalleryPhoto } from "~/types/photo";

export interface GalleryProps {
  photos: GalleryPhoto[];
  caption: JSX.Element;
  currentCollectionId?: string;
  loading?: boolean;
}

interface GalleryShellProps {
  children: JSX.Element;
}

function GalleryShell(props: GalleryShellProps) {
  const [isAdmin, setIsAdmin] = createSignal(false);
  const { collections, collectionsLoaded, loadCollections } = useCollections();

  onMount(async () => {
    setIsAdmin(isAuthenticated());
    await loadCollections();
  });

  function handleUploadComplete() {
    window.location.reload();
  }

  return (
    <main class="text-center mx-auto font-mono text-violet-200 pb-20">
      <Show when={isAdmin()}>
        <a
          href="/admin"
          class="fixed top-4 right-4 z-50 p-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors backdrop-blur-sm"
          title="Admin"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </a>
      </Show>

      <Show when={isAdmin() && collections()}>
        <UploadButton
          collections={collections() || []}
          onUploadComplete={handleUploadComplete}
        />
      </Show>

      <h1 class="text-2xl sm:text-4xl font-thin leading-tight mt-2 md:mt-12 mb-8 mx-auto max-w-[14rem] md:max-w-none">
        gallery
      </h1>

      {props.children}
    </main>
  );
}

function CollectionLink({
  href,
  children,
  active,
}: {
  href: string;
  children: JSX.Element;
  active?: boolean;
}) {
  return (
    <A
      href={href}
      class={`underline hover:text-violet-300 ${
        active ? "text-violet-200 font-medium" : "text-violet-400"
      }`}
    >
      {children}
    </A>
  );
}

export function Gallery(props: GalleryProps) {
  const [expandedIndex, setExpandedIndex] = createSignal<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { collections, collectionsLoaded } = useCollections();
  const [playAnimations] = createSignal(
    shouldPlayAnimations(props.currentCollectionId),
  );
  const [captionVisible, setCaptionVisible] = createSignal(true);

  const photos = () => props.photos;

  onMount(() => {
    const imageParam = searchParams.image;
    if (imageParam) {
      const photoIndex = photos().findIndex((p) => p.url === imageParam);
      if (photoIndex !== -1) {
        setExpandedIndex(photoIndex);
      }
    }
  });

  // Fade caption when it changes
  createEffect(() => {
    const _ = props.caption; // Track caption changes
    setCaptionVisible(false);
    setTimeout(() => setCaptionVisible(true), 250);
  });

  const updateUrlWithImage = (index: number | null) => {
    if (index !== null && photos()[index]) {
      setSearchParams({ image: photos()[index].url });
    } else {
      setSearchParams({ image: undefined });
    }
  };

  const setExpandedIndexWithUrl = (index: number | null) => {
    setExpandedIndex(index);
    updateUrlWithImage(index);
  };

  return (
    <GalleryShell>
      <div class="text-violet-200 mb-4 text-xs md:text-sm mx-4">
        <div
          class="min-h-[20px] transition-opacity duration-150"
          style={{ opacity: captionVisible() ? 1 : 0 }}
        >
          {props.caption}
        </div>
        <div class="mt-2 space-x-2">
          <span>collections:</span>
          <Show
            when={collectionsLoaded() && collections().length > 0}
            fallback={
              <Show when={!collectionsLoaded()}>
                <span class="text-zinc-500">loading...</span>
              </Show>
            }
          >
            <For each={collections()}>
              {(collection) => (
                <CollectionLink
                  href={`/${collection.id}`}
                  active={props.currentCollectionId === collection.id}
                >
                  {collection.name}
                </CollectionLink>
              )}
            </For>
          </Show>
        </div>
        <div class="w-fill p-1 sm:p-2 md:p-4">
          <Show
            when={!props.loading}
            fallback={
              <div class="flex justify-center items-center min-h-[300px]">
                <div class="text-violet-400 text-sm">Loading...</div>
              </div>
            }
          >
            <div class="flex flex-wrap gap-1 sm:gap-2">
              <For each={photos()}>
                {(photo, index) => (
                  <PhotoComponent
                    photo={photo}
                    index={index()}
                    onClick={() => setExpandedIndexWithUrl(index())}
                    playAnimation={playAnimations()}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        <Show when={expandedIndex() !== null}>
          <Carousel
            photos={photos()}
            initialIndex={expandedIndex()!}
            onClose={() => setExpandedIndexWithUrl(null)}
          />
        </Show>
      </div>
    </GalleryShell>
  );
}
