import {
  onCleanup,
  createEffect,
  createSignal,
  For,
  type JSX,
  onMount,
  Show,
} from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { GripVertical, Images, Pencil } from "lucide-solid";
import { Photo as PhotoComponent } from "~/components/photos/Photo";
import { Carousel } from "~/components/photos/Carousel";
import { getStoredAuthKey, isAuthenticated } from "~/lib/auth";
import { UploadButton } from "~/components/admin/UploadButton";
import {
  AdminGalleryOverlay,
  type EditableCollection,
} from "~/components/admin/AdminGalleryOverlay";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { useCollections, shouldPlayAnimations } from "~/lib/galleryStore";
import { formatDate } from "~/utils/date";

export { type GalleryPhoto } from "~/types/photo";

export interface GalleryProps {
  photos: GalleryPhoto[];
  caption: JSX.Element;
  currentCollectionId?: string;
  currentCollection?: EditableCollection;
  loading?: boolean;
}

interface PhotoDragState {
  photo: GalleryPhoto;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  active: boolean;
}

const SLOT_DEBOUNCE_MS = 140;
const SLOT_ANIMATION_MS = 220;

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
  const [editablePhotos, setEditablePhotos] = createSignal<GalleryPhoto[]>([]);
  const [originalOrder, setOriginalOrder] = createSignal<string[]>([]);
  const [orderHistory, setOrderHistory] = createSignal<string[][]>([]);
  const [orderHistoryIndex, setOrderHistoryIndex] = createSignal(0);
  const [selectedPhotoIds, setSelectedPhotoIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [dragState, setDragState] = createSignal<PhotoDragState>();
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal<
    { type: "success" | "error"; text: string } | undefined
  >();
  const [playAnimations] = createSignal(
    shouldPlayAnimations(props.currentCollectionId),
  );
  const [captionVisible, setCaptionVisible] = createSignal(true);
  let suppressedClick: { photoId: string; until: number } | undefined;
  let pendingSlotPhotoId: string | undefined;
  let pendingSlotTimer: number | undefined;
  let lastSlottedPhotoId: string | undefined;
  let slotLockedUntil = 0;

  const photos = () => editablePhotos();
  const canUndo = () => orderHistoryIndex() > 0;
  const canRedo = () => orderHistoryIndex() < orderHistory().length - 1;
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
    const nextOrder = nextPhotos.map((photo) => photo.id);
    setEditablePhotos([...nextPhotos]);
    setOriginalOrder(nextOrder);
    setOrderHistory([nextOrder]);
    setOrderHistoryIndex(0);
  });

  createEffect(() => {
    const _ = props.caption;
    setCaptionVisible(false);
    setTimeout(() => setCaptionVisible(true), 250);
  });

  onMount(() => {
    window.addEventListener("keydown", handleEditKeyDown);
    void (async () => {
      const authenticated = isAuthenticated();
      setIsAdmin(authenticated);
      await loadCollections();

      if (authenticated && searchParams.edit === "1") setEditMode(true);

      const imageParam = searchParams.image;
      if (searchParams.edit !== "1" && imageParam) {
        const photoIndex = photos().findIndex(
          (photo) => photo.url === imageParam,
        );
        if (photoIndex !== -1) setExpandedIndex(photoIndex);
      }
    })();
  });

  onCleanup(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("keydown", handleEditKeyDown);
    stopPointerTracking();
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

    if (
      suppressedClick?.photoId === photo.id &&
      performance.now() < suppressedClick.until
    ) {
      suppressedClick = undefined;
      return;
    }
    togglePhoto(photo.id);
  }

  function handleSelectAll() {
    if (selectedPhotoIds().size === photos().length) {
      setSelectedPhotoIds(new Set<string>());
    } else {
      setSelectedPhotoIds(new Set(photos().map((photo) => photo.id)));
    }
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
    setMessage(undefined);
    setEditMode(false);
    setSearchParams({ edit: undefined, mode: undefined });
  }

  function enterEditMode() {
    setExpandedIndexWithUrl(null);
    setEditMode(true);
    setSearchParams({ edit: "1", image: undefined, mode: undefined });
  }

  function moveDraggedPhoto(targetPhotoId: string) {
    const draggedId = dragState()?.photo.id;
    if (!draggedId || draggedId === targetPhotoId) return;

    const reordered = [...photos()];
    const fromIndex = reordered.findIndex((photo) => photo.id === draggedId);
    const toIndex = reordered.findIndex(
      (photo) => photo.id === targetPhotoId,
    );
    if (fromIndex === -1 || toIndex === -1) return;

    const previousPositions = new Map<string, DOMRect>();
    document
      .querySelectorAll<HTMLElement>("[data-reorder-photo-id]")
      .forEach((element) => {
        const photoId = element.dataset.reorderPhotoId;
        if (photoId) previousPositions.set(photoId, element.getBoundingClientRect());
      });

    const [photo] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, photo);
    setEditablePhotos(reordered);

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      requestAnimationFrame(() => {
        document
          .querySelectorAll<HTMLElement>("[data-reorder-photo-id]")
          .forEach((element) => {
            const photoId = element.dataset.reorderPhotoId;
            const previous = photoId ? previousPositions.get(photoId) : undefined;
            if (!previous) return;
            const next = element.getBoundingClientRect();
            const deltaX = previous.left - next.left;
            const deltaY = previous.top - next.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
            element.getAnimations().forEach((animation) => animation.cancel());
            element.animate(
              [
                { transform: `translate(${deltaX}px, ${deltaY}px)` },
                { transform: "translate(0, 0)" },
              ],
              {
                duration: SLOT_ANIMATION_MS,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              },
            );
          });
      });
    }
  }

  function handleReorderPointerDown(
    photo: GalleryPhoto,
    event: PointerEvent,
  ) {
    if (
      !editMode() ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    stopPointerTracking();
    lastSlottedPhotoId = undefined;
    slotLockedUntil = 0;
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setDragState({
      photo,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
      active: false,
    });
    window.addEventListener("pointermove", handleReorderPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleReorderPointerEnd);
    window.addEventListener("pointercancel", handleReorderPointerEnd);
  }

  function handleReorderPointerMove(event: PointerEvent) {
    const current = dragState();
    if (!current || event.pointerId !== current.pointerId) return;

    const active =
      current.active ||
      Math.hypot(event.clientX - current.startX, event.clientY - current.startY) >
        6;
    if (!active) return;

    event.preventDefault();
    if (!current.active) window.getSelection()?.removeAllRanges();
    setDragState({
      ...current,
      x: event.clientX,
      y: event.clientY,
      active: true,
    });

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-reorder-photo-id]");
    const targetPhotoId = target?.dataset.reorderPhotoId;
    queuePhotoSlot(targetPhotoId);

    const edge = 72;
    if (event.clientY < edge) {
      window.scrollBy(0, -Math.ceil((edge - event.clientY) / 4));
    } else if (event.clientY > window.innerHeight - edge) {
      window.scrollBy(
        0,
        Math.ceil((event.clientY - (window.innerHeight - edge)) / 4),
      );
    }
  }

  function handleReorderPointerEnd(event: PointerEvent) {
    const current = dragState();
    if (!current || event.pointerId !== current.pointerId) return;

    if (current.active) {
      suppressedClick = {
        photoId: current.photo.id,
        until: performance.now() + 300,
      };
      recordOrder(photos().map((photo) => photo.id));
    }
    setDragState(undefined);
    stopPointerTracking();
  }

  function stopPointerTracking() {
    if (typeof window === "undefined") return;
    window.removeEventListener("pointermove", handleReorderPointerMove);
    window.removeEventListener("pointerup", handleReorderPointerEnd);
    window.removeEventListener("pointercancel", handleReorderPointerEnd);
    clearPendingSlot();
  }

  function clearPendingSlot() {
    if (pendingSlotTimer !== undefined) window.clearTimeout(pendingSlotTimer);
    pendingSlotTimer = undefined;
    pendingSlotPhotoId = undefined;
  }

  function queuePhotoSlot(targetPhotoId: string | undefined) {
    const draggedId = dragState()?.photo.id;
    if (
      !targetPhotoId ||
      targetPhotoId === draggedId ||
      targetPhotoId === lastSlottedPhotoId ||
      performance.now() < slotLockedUntil
    ) {
      if (targetPhotoId !== pendingSlotPhotoId) clearPendingSlot();
      return;
    }
    if (targetPhotoId === pendingSlotPhotoId) return;

    clearPendingSlot();
    pendingSlotPhotoId = targetPhotoId;
    pendingSlotTimer = window.setTimeout(() => {
      const queuedPhotoId = pendingSlotPhotoId;
      pendingSlotPhotoId = undefined;
      pendingSlotTimer = undefined;
      if (!dragState()?.active || !queuedPhotoId) return;

      moveDraggedPhoto(queuedPhotoId);
      lastSlottedPhotoId = queuedPhotoId;
      slotLockedUntil = performance.now() + SLOT_ANIMATION_MS;
    }, SLOT_DEBOUNCE_MS);
  }

  function ordersMatch(left: string[], right: string[]) {
    return (
      left.length === right.length &&
      left.every((photoId, index) => photoId === right[index])
    );
  }

  function recordOrder(order: string[]) {
    const history = orderHistory();
    const index = orderHistoryIndex();
    if (ordersMatch(history[index] || [], order)) return;
    setOrderHistory([...history.slice(0, index + 1), order]);
    setOrderHistoryIndex(index + 1);
  }

  function applyOrder(order: string[]) {
    const byId = new Map(photos().map((photo) => [photo.id, photo]));
    const reordered = order
      .map((photoId) => byId.get(photoId))
      .filter((photo): photo is GalleryPhoto => Boolean(photo));
    setEditablePhotos(reordered);
  }

  function undoLocalAction() {
    if (!canUndo()) return;
    const nextIndex = orderHistoryIndex() - 1;
    applyOrder(orderHistory()[nextIndex]);
    setOrderHistoryIndex(nextIndex);
    setMessage(undefined);
  }

  function redoLocalAction() {
    if (!canRedo()) return;
    const nextIndex = orderHistoryIndex() + 1;
    applyOrder(orderHistory()[nextIndex]);
    setOrderHistoryIndex(nextIndex);
    setMessage(undefined);
  }

  function handleEditKeyDown(event: KeyboardEvent) {
    if (!editMode() || busy() || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable=true]")) {
      return;
    }
    if (event.key.toLowerCase() !== "z") return;
    event.preventDefault();
    if (event.shiftKey) redoLocalAction();
    else undoLocalAction();
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

      const remainingPhotos = photos().filter(
        (photo) => !removed.has(photo.id),
      );
      const remainingOrder = remainingPhotos.map((photo) => photo.id);
      setEditablePhotos(remainingPhotos);
      setOriginalOrder(remainingOrder);
      setOrderHistory([remainingOrder]);
      setOrderHistoryIndex(0);
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
      setOrderHistory([photoIds]);
      setOrderHistoryIndex(0);
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
    recordOrder(shuffled.map((photo) => photo.id));
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
          photoCount={photos().length}
          selectedCount={selectedPhotoIds().size}
          orderChanged={orderChanged()}
          canUndo={canUndo()}
          canRedo={canRedo()}
          busy={busy()}
          message={message()}
          onExit={exitEditMode}
          onSelectAll={handleSelectAll}
          onAddToCollection={addSelectedToCollection}
          onRemoveFromCollection={removeSelectedFromCollection}
          onSaveOrder={saveOrder}
          onShuffle={shufflePhotos}
          onUndo={undoLocalAction}
          onRedo={redoLocalAction}
          onUploadComplete={() => window.location.reload()}
        />
      </Show>

      <Show when={dragState()?.active ? dragState() : undefined}>
        {(drag) => (
          <div
            class="pointer-events-none fixed z-[70] flex rotate-[1.5deg] scale-[1.04] flex-col overflow-hidden rounded-xl border-2 border-violet-300 bg-zinc-950 shadow-[0_30px_90px_rgba(0,0,0,0.8),0_0_35px_rgba(139,92,246,0.55)]"
            style={{
              left: `${drag().x - drag().offsetX}px`,
              top: `${drag().y - drag().offsetY}px`,
              width: `${drag().width}px`,
              height: `${drag().height}px`,
              "transform-origin": `${drag().offsetX}px ${drag().offsetY}px`,
            }}
          >
            <div class="relative min-h-0 flex-1 overflow-hidden">
              <img
                src={`${S3_PREFIX}${drag().photo.thumbnail}`}
                alt=""
                class="h-full w-full object-cover"
                draggable={false}
              />
              <span class="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white shadow-lg">
                <GripVertical class="h-3.5 w-3.5" />
                Moving
              </span>
            </div>
            <div class="flex h-7 shrink-0 items-center bg-zinc-950 px-2 text-left text-xs text-violet-200">
              {drag().photo.date ? formatDate(drag().photo.date) : ""}
            </div>
          </div>
        )}
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
                    dragging={
                      dragState()?.active && dragState()?.photo.id === photo.id
                    }
                    onReorderPointerDown={(event) =>
                      handleReorderPointerDown(photo, event)
                    }
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
