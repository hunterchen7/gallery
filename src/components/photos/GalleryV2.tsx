import {
  createEffect,
  createSignal,
  For,
  type JSX,
  onMount,
  Show,
} from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { Images, Pencil } from "lucide-solid";
import { Photo as PhotoComponent } from "~/components/photos/Photo";
import { Carousel } from "~/components/photos/Carousel";
import { getStoredAuthKey, isAuthenticated } from "~/lib/auth";
import { UploadButton } from "~/components/admin/UploadButton";
import {
  AdminGalleryOverlay,
  type EditableCollection,
  type GalleryEditMode,
} from "~/components/admin/AdminGalleryOverlay";
import { type GalleryPhoto } from "~/types/photo";
import { useCollections, shouldPlayAnimations } from "~/lib/galleryStore";

export { type GalleryPhoto } from "~/types/photo";

export interface GalleryProps {
  photos: GalleryPhoto[];
  caption: JSX.Element;
  currentCollectionId?: string;
  currentCollection?: EditableCollection;
  loading?: boolean;
}

function GalleryShell(props: { children: JSX.Element }) {
  return (
    <main class="mx-auto pb-20 text-center font-mono text-violet-200">
      <h1 class="mx-auto mb-8 mt-2 max-w-[14rem] text-2xl font-thin leading-tight sm:text-4xl md:mt-12 md:max-w-none">
        gallery
      </h1>
      {props.children}
    </main>
  );
}

function CollectionLink(props: {
  href: string;
  children: JSX.Element;
  active?: boolean;
}) {
  return (
    <A
      href={props.href}
      class={`underline hover:text-violet-300 ${
        props.active ? "font-medium text-violet-200" : "text-violet-400"
      }`}
    >
      {props.children}
    </A>
  );
}

export function Gallery(props: GalleryProps) {
  const [expandedIndex, setExpandedIndex] = createSignal<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { collections, collectionsLoaded, loadCollections } = useCollections();
  const [isAdmin, setIsAdmin] = createSignal(false);
  const [editMode, setEditMode] = createSignal(false);
  const [galleryEditMode, setGalleryEditMode] =
    createSignal<GalleryEditMode>("select");
  const [editablePhotos, setEditablePhotos] = createSignal<GalleryPhoto[]>([]);
  const [originalOrder, setOriginalOrder] = createSignal<string[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [draggedPhotoId, setDraggedPhotoId] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<
    { type: "success" | "error"; text: string } | undefined
  >();
  const [playAnimations] = createSignal(
    shouldPlayAnimations(props.currentCollectionId),
  );
  const [captionVisible, setCaptionVisible] = createSignal(true);

  const photos = () => editablePhotos();
  const orderChanged = () => {
    const current = photos().map((photo) => photo.id);
    const original = originalOrder();
    return (
      current.length !== original.length ||
      current.some((photoId, index) => photoId !== original[index])
    );
  };

  createEffect(() => {
    const nextPhotos = props.photos;
    setEditablePhotos([...nextPhotos]);
    setOriginalOrder(nextPhotos.map((photo) => photo.id));
  });

  createEffect(() => {
    const _ = props.caption;
    setCaptionVisible(false);
    setTimeout(() => setCaptionVisible(true), 250);
  });

  onMount(async () => {
    const authenticated = isAuthenticated();
    setIsAdmin(authenticated);
    await loadCollections();

    if (authenticated && searchParams.edit === "1") {
      setEditMode(true);
      if (searchParams.mode === "reorder") setGalleryEditMode("reorder");
    }

    const imageParam = searchParams.image;
    if (searchParams.edit !== "1" && imageParam) {
      const photoIndex = photos().findIndex((photo) => photo.url === imageParam);
      if (photoIndex !== -1) setExpandedIndex(photoIndex);
    }
  });

  function updateUrlWithImage(index: number | null) {
    if (index !== null && photos()[index]) {
      setSearchParams({ image: photos()[index].url });
    } else {
      setSearchParams({ image: undefined });
    }
  }

  function setExpandedIndexWithUrl(index: number | null) {
    setExpandedIndex(index);
    updateUrlWithImage(index);
  }

  function togglePhoto(photoId: string) {
    const selected = new Set(selectedPhotoIds());
    if (selected.has(photoId)) selected.delete(photoId);
    else selected.add(photoId);
    setSelectedPhotoIds(selected);
  }

  function handlePhotoClick(photo: GalleryPhoto, index: number) {
    if (!editMode()) {
      setExpandedIndexWithUrl(index);
      return;
    }
    if (galleryEditMode() === "select") togglePhoto(photo.id);
  }

  function handleSelectAll() {
    if (selectedPhotoIds().size === photos().length) {
      setSelectedPhotoIds(new Set<string>());
    } else {
      setSelectedPhotoIds(new Set(photos().map((photo) => photo.id)));
    }
  }

  function handleModeChange(mode: GalleryEditMode) {
    setGalleryEditMode(mode);
    setSearchParams({ mode: mode === "reorder" ? "reorder" : undefined });
    setSelectedPhotoIds(new Set<string>());
    setMessage(undefined);
  }

  function restoreOriginalOrder() {
    const byId = new Map(photos().map((photo) => [photo.id, photo]));
    const restored = originalOrder()
      .map((photoId) => byId.get(photoId))
      .filter((photo): photo is GalleryPhoto => Boolean(photo));
    setEditablePhotos(restored);
  }

  function exitEditMode() {
    if (orderChanged() && !confirm("Discard your unsaved photo order?")) return;
    if (orderChanged()) restoreOriginalOrder();
    setSelectedPhotoIds(new Set<string>());
    setGalleryEditMode("select");
    setMessage(undefined);
    setEditMode(false);
    setSearchParams({ edit: undefined, mode: undefined });
  }

  function enterEditMode() {
    setExpandedIndexWithUrl(null);
    setEditMode(true);
    setSearchParams({ edit: "1", image: undefined });
  }

  function moveDraggedPhoto(targetPhotoId: string) {
    const draggedId = draggedPhotoId();
    if (!draggedId || draggedId === targetPhotoId) return;

    const reordered = [...photos()];
    const fromIndex = reordered.findIndex((photo) => photo.id === draggedId);
    const toIndex = reordered.findIndex(
      (photo) => photo.id === targetPhotoId,
    );
    if (fromIndex === -1 || toIndex === -1) return;

    const [photo] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, photo);
    setEditablePhotos(reordered);
  }

  function handleReorderPointerDown(photoId: string, event: PointerEvent) {
    if (
      galleryEditMode() !== "reorder" ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDraggedPhotoId(photoId);
  }

  function handleReorderPointerMove(event: PointerEvent) {
    if (!draggedPhotoId()) return;
    event.preventDefault();

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reorder-photo-id]");
    const targetPhotoId = target?.dataset.reorderPhotoId;
    if (targetPhotoId) moveDraggedPhoto(targetPhotoId);
  }

  function handleReorderPointerEnd(event: PointerEvent) {
    const card = event.currentTarget as HTMLElement;
    if (card.hasPointerCapture(event.pointerId)) {
      card.releasePointerCapture(event.pointerId);
    }
    setDraggedPhotoId(null);
  }

  async function addSelectedToCollection(collectionId: string) {
    const photoIds = [...selectedPhotoIds()];
    if (!collectionId || photoIds.length === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/collections/${collectionId}/photos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": getStoredAuthKey() || "",
        },
        body: JSON.stringify({ photoIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to add photos");

      const targetName = collections().find(
        (collection) => collection.id === collectionId,
      )?.name;
      setMessage({
        type: "success",
        text: `${result.added} photo(s) added to ${targetName || collectionId}${
          result.alreadyPresent
            ? ` · ${result.alreadyPresent} already present`
            : ""
        }`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to add photos",
      });
    } finally {
      setBusy(false);
    }
  }

  async function removeSelectedFromCollection() {
    const collectionId = props.currentCollectionId;
    const photoIds = [...selectedPhotoIds()];
    if (!collectionId || photoIds.length === 0) return;
    if (
      !confirm(
        `Remove ${photoIds.length} photo(s) from this collection? The original files will remain in R2.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(undefined);
    const removed = new Set<string>();
    try {
      for (const photoId of photoIds) {
        const response = await fetch(
          `/api/photos/${photoId}/collections/${collectionId}`,
          {
            method: "DELETE",
            headers: { "X-Auth-Key": getStoredAuthKey() || "" },
          },
        );
        if (response.ok) removed.add(photoId);
      }

      setEditablePhotos((current) =>
        current.filter((photo) => !removed.has(photo.id)),
      );
      setOriginalOrder((current) =>
        current.filter((photoId) => !removed.has(photoId)),
      );
      setSelectedPhotoIds(new Set<string>());
      setMessage({
        type: removed.size === photoIds.length ? "success" : "error",
        text:
          removed.size === photoIds.length
            ? `${removed.size} photo(s) removed from this collection`
            : `Removed ${removed.size} of ${photoIds.length} photo(s)`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to remove selected photos",
      });
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder() {
    const collectionId = props.currentCollectionId;
    if (!collectionId || !orderChanged()) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const photoIds = photos().map((photo) => photo.id);
      const response = await fetch(`/api/collections/${collectionId}/reorder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": getStoredAuthKey() || "",
        },
        body: JSON.stringify({ photoIds }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Failed to save order");
      setOriginalOrder(photoIds);
      setMessage({ type: "success", text: "Photo order saved" });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save order",
      });
    } finally {
      setBusy(false);
    }
  }

  function shufflePhotos() {
    const shuffled = [...photos()];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    setEditablePhotos(shuffled);
    setMessage(undefined);
  }

  return (
    <GalleryShell>
      <Show when={isAdmin() && collectionsLoaded()}>
        <Show when={!editMode()}>
          <UploadButton
            collections={collections()}
            defaultCollectionId={props.currentCollectionId}
            onUploadComplete={() => window.location.reload()}
          />
          <div class="fixed right-4 top-4 z-40 flex items-center gap-2">
            <a
              href="/admin"
              class="flex items-center gap-2 rounded-full bg-zinc-900/90 px-3 py-2 text-sm font-medium text-violet-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-violet-600 hover:text-white sm:px-4"
            >
              <Images class="h-4 w-4" />
              <span class="hidden sm:inline">Galleries</span>
            </a>
            <button
              onClick={enterEditMode}
              class="flex items-center gap-2 rounded-full bg-zinc-900/90 px-3 py-2 text-sm font-medium text-violet-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-violet-600 hover:text-white sm:px-4"
            >
              <Pencil class="h-4 w-4" />
              Edit
            </button>
          </div>
        </Show>
      </Show>

      <Show when={isAdmin() && editMode()}>
        <AdminGalleryOverlay
          collections={collections()}
          currentCollection={props.currentCollection}
          currentCollectionId={props.currentCollectionId}
          mode={galleryEditMode()}
          photoCount={photos().length}
          selectedCount={selectedPhotoIds().size}
          orderChanged={orderChanged()}
          busy={busy()}
          message={message()}
          onExit={exitEditMode}
          onModeChange={handleModeChange}
          onSelectAll={handleSelectAll}
          onAddToCollection={addSelectedToCollection}
          onRemoveFromCollection={removeSelectedFromCollection}
          onSaveOrder={saveOrder}
          onShuffle={shufflePhotos}
          onUploadComplete={() => window.location.reload()}
        />
      </Show>

      <div class="mx-4 mb-4 text-xs text-violet-200 md:text-sm">
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
              <div class="flex min-h-[300px] items-center justify-center">
                <div class="text-sm text-violet-400">Loading...</div>
              </div>
            }
          >
            <div class="flex flex-wrap gap-1 sm:gap-2">
              <For each={photos()}>
                {(photo, index) => (
                  <PhotoComponent
                    photo={photo}
                    index={index()}
                    onClick={() => handlePhotoClick(photo, index())}
                    playAnimation={playAnimations() && !editMode()}
                    editing={editMode()}
                    selected={selectedPhotoIds().has(photo.id)}
                    reorderMode={
                      editMode() && galleryEditMode() === "reorder"
                    }
                    dragging={draggedPhotoId() === photo.id}
                    onReorderPointerDown={(event) =>
                      handleReorderPointerDown(photo.id, event)
                    }
                    onReorderPointerMove={handleReorderPointerMove}
                    onReorderPointerEnd={handleReorderPointerEnd}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        <Show when={!editMode() && expandedIndex() !== null}>
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
