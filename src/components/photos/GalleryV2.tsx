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
import {
  Check,
  GripVertical,
  Loader2,
  Settings,
  X,
} from "lucide-solid";
import { Photo as PhotoComponent } from "~/components/photos/Photo";
import { Carousel } from "~/components/photos/Carousel";
import { getStoredAuthKey, isAuthenticated } from "~/lib/auth";
import { GalleryActions } from "~/components/photos/GalleryActions";
import { UploadButton } from "~/components/admin/UploadButton";
import { type GalleryPhoto, S3_PREFIX } from "~/types/photo";
import { useCollections } from "~/lib/galleryStore";
import { formatDate } from "~/utils/date";

export { type GalleryPhoto } from "~/types/photo";

export interface GalleryProps {
  photos: GalleryPhoto[];
  caption: JSX.Element;
  currentCollectionId?: string;
  currentCollection?: EditableCollection;
  loading?: boolean;
}

export interface EditableCollection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
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

function GalleryShell(props: { title: JSX.Element; children: JSX.Element }) {
  return (
    <main class="mx-auto pb-12 text-center font-mono text-violet-200">
      <h1 class="mx-auto mb-8 mt-2 flex h-12 max-w-[14rem] items-center justify-center text-2xl font-thin leading-tight sm:text-4xl md:mt-12 md:max-w-none">
        {props.title}
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
  const [displayName, setDisplayName] = createSignal("gallery");
  const [displayDescription, setDisplayDescription] = createSignal("");
  const [draftName, setDraftName] = createSignal("gallery");
  const [draftDescription, setDraftDescription] = createSignal("");
  const [savingDetails, setSavingDetails] = createSignal(false);
  const [detailsStatus, setDetailsStatus] = createSignal<{
    type: "success" | "error";
    text: string;
  }>();
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
  let suppressedClick: { photoId: string; until: number } | undefined;
  let pendingSlotPhotoId: string | undefined;
  let pendingSlotTimer: number | undefined;
  let lastSlottedPhotoId: string | undefined;
  let slotLockedUntil = 0;

  const photos = () => editablePhotos();
  const canUndo = () => orderHistoryIndex() > 0;
  const canRedo = () => orderHistoryIndex() < orderHistory().length - 1;
  const detailsChanged = () =>
    draftName().trim() !== displayName() ||
    draftDescription().trim() !== displayDescription();
  const hasPendingChanges = () => detailsChanged() || orderChanged();
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
    const collection = props.currentCollection;
    const name = collection?.name || "gallery";
    const description = collection?.description || "";
    setDisplayName(name);
    setDisplayDescription(description);
    setDraftName(name);
    setDraftDescription(description);
    setDetailsStatus(undefined);
  });

  onMount(() => {
    window.addEventListener("keydown", handleEditKeyDown);
    void (async () => {
      const authenticated = isAuthenticated();
      setIsAdmin(authenticated);
      await loadCollections();

      const imageParam = searchParams.image;
      if (imageParam) {
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
    if (
      suppressedClick?.photoId === photo.id &&
      performance.now() < suppressedClick.until
    ) {
      suppressedClick = undefined;
      return;
    }
    if (selectedPhotoIds().size > 0) togglePhoto(photo.id);
    else setExpandedIndexWithUrl(index);
  }

  function handleSelectAll() {
    if (selectedPhotoIds().size === photos().length) {
      setSelectedPhotoIds(new Set<string>());
    } else {
      setSelectedPhotoIds(new Set(photos().map((photo) => photo.id)));
    }
  }

  function clearSelection() {
    setSelectedPhotoIds(new Set<string>());
    setMessage(undefined);
    setDetailsStatus(undefined);
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
      !isAdmin() ||
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
    if (!isAdmin() || busy() || !(event.metaKey || event.ctrlKey)) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable=true]")) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) redoLocalAction();
      else undoLocalAction();
    } else if (key === "s" && hasPendingChanges()) {
      event.preventDefault();
      void savePendingChanges();
    }
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

  async function saveCollectionDetails(): Promise<boolean> {
    const collectionId = props.currentCollectionId;
    if (!detailsChanged()) return true;
    if (!collectionId || !draftName().trim()) {
      setDetailsStatus({ type: "error", text: "Gallery name is required" });
      return false;
    }

    setSavingDetails(true);
    setDetailsStatus(undefined);
    try {
      const response = await fetch(`/api/collections/${collectionId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": getStoredAuthKey() || "",
        },
        body: JSON.stringify({
          name: draftName().trim(),
          description: draftDescription().trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to save gallery details");
      }

      setDisplayName(result.name);
      setDisplayDescription(result.description || "");
      setDraftName(result.name);
      setDraftDescription(result.description || "");
      await loadCollections(true);
      return true;
    } catch (error) {
      setDetailsStatus({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save gallery details",
      });
      return false;
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveOrder(): Promise<boolean> {
    const collectionId = props.currentCollectionId;
    if (!orderChanged()) return true;
    if (!collectionId) return false;
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
      return true;
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to save order",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function savePendingChanges() {
    if (busy() || savingDetails()) return;
    if (!(await saveCollectionDetails())) return;
    if (!(await saveOrder())) return;
  }

  async function handleUploadComplete() {
    if (hasPendingChanges()) {
      if (!(await saveCollectionDetails())) return;
      if (!(await saveOrder())) return;
    }
    window.location.reload();
  }

  async function downloadSelectedPhotos() {
    const selectedPhotos = photos().filter((photo) =>
      selectedPhotoIds().has(photo.id),
    );
    if (selectedPhotos.length === 0) return;

    setBusy(true);
    setMessage(undefined);
    try {
      for (const photo of selectedPhotos) {
        const link = document.createElement("a");
        link.href = `/api/photos/${photo.id}/download`;
        link.download = "";
        document.body.append(link);
        link.click();
        link.remove();
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      setMessage({
        type: "success",
        text: `${selectedPhotos.length} download${selectedPhotos.length === 1 ? "" : "s"} started`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Download failed",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <GalleryShell
      title={
        <Show
          when={isAdmin() && props.currentCollectionId}
          fallback={displayName()}
        >
          <input
            value={draftName()}
            onInput={(event) => setDraftName(event.currentTarget.value)}
            class="w-[min(82vw,36rem)] border-b border-transparent bg-transparent px-2 text-center font-thin text-violet-100 outline-none transition-colors hover:border-zinc-700 focus:border-violet-400"
            aria-label="Gallery name"
          />
        </Show>
      }
    >
      <Show when={isAdmin() && collectionsLoaded()}>
        <UploadButton
          collections={collections()}
          defaultCollectionId={props.currentCollectionId}
          onUploadComplete={handleUploadComplete}
          enablePageDrop
        />

        <div class="fixed right-4 top-4 z-40 flex items-center gap-2">
          <A
            href="/admin"
            onClick={(event) => {
              if (
                hasPendingChanges() &&
                !confirm("Leave without saving your gallery changes?")
              ) {
                event.preventDefault();
              }
            }}
            class="flex items-center gap-2 rounded-full bg-zinc-900/90 px-3 py-2 text-sm font-medium text-violet-200 shadow-lg backdrop-blur-sm transition-colors hover:bg-zinc-800 sm:px-4"
          >
            <Settings class="h-4 w-4" />
            <span class="hidden sm:inline">Settings</span>
          </A>

          <button
            onClick={() =>
              void (hasPendingChanges()
                ? savePendingChanges()
                : clearSelection())
            }
            disabled={
              busy() ||
              savingDetails() ||
              (!hasPendingChanges() && selectedPhotoIds().size === 0)
            }
            class={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg backdrop-blur-sm transition-colors disabled:opacity-35 ${
              hasPendingChanges()
                ? "bg-violet-600 text-white hover:bg-violet-500"
                : "bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800"
            }`}
            title={hasPendingChanges() ? "Save changes" : "Clear selection"}
            aria-label={
              hasPendingChanges() ? "Save changes" : "Clear selection"
            }
          >
            <Show
              when={!busy() && !savingDetails()}
              fallback={<Loader2 class="h-5 w-5 animate-spin" />}
            >
              <span class="relative block h-5 w-5">
                <X
                  class={`absolute inset-0 h-5 w-5 transition-all duration-200 ${
                    hasPendingChanges()
                      ? "scale-75 opacity-0"
                      : "scale-100 opacity-100"
                  }`}
                />
                <Check
                  class={`absolute inset-0 h-5 w-5 stroke-[2.5] transition-all duration-200 ${
                    hasPendingChanges()
                      ? "scale-100 opacity-100"
                      : "scale-75 opacity-0"
                  }`}
                />
              </span>
            </Show>
          </button>
        </div>
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
        <div class="mx-auto h-20 max-w-2xl px-3">
          <Show
            when={isAdmin() && props.currentCollectionId}
            fallback={
              <Show
                when={props.currentCollection}
                fallback={props.caption}
              >
                <p class="flex h-16 items-center justify-center text-zinc-400">
                  {displayDescription()}
                </p>
              </Show>
            }
          >
            <textarea
              value={draftDescription()}
              onInput={(event) =>
                setDraftDescription(event.currentTarget.value)
              }
              placeholder="Add a description"
              class="h-14 w-full resize-none rounded-lg border border-transparent bg-transparent px-3 py-2 text-center text-sm text-violet-200 outline-none transition-colors placeholder:text-zinc-600 hover:border-zinc-800 focus:border-violet-600 focus:bg-zinc-950/60"
              aria-label="Gallery description"
            />
            <div class="h-5 pt-1 text-xs">
              <Show when={detailsStatus()}>
                {(status) => (
                  <span
                    class={
                      status().type === "error"
                        ? "text-red-400"
                        : "text-green-400"
                    }
                  >
                    {status().text}
                  </span>
                )}
              </Show>
            </div>
          </Show>
        </div>

        <div class="mt-2 flex h-10 items-center justify-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span class="shrink-0">collections:</span>
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

        <GalleryActions
          isAdmin={isAdmin()}
          collections={collections()}
          currentCollectionId={props.currentCollectionId}
          photoCount={photos().length}
          selectedCount={selectedPhotoIds().size}
          canUndo={canUndo()}
          canRedo={canRedo()}
          busy={busy() || savingDetails()}
          message={message()}
          onSelectAll={handleSelectAll}
          onDownloadSelected={downloadSelectedPhotos}
          onAddToCollection={addSelectedToCollection}
          onRemoveFromCollection={removeSelectedFromCollection}
          onUndo={undoLocalAction}
          onRedo={redoLocalAction}
        />

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
                    editing={isAdmin()}
                    selected={selectedPhotoIds().has(photo.id)}
                    dragging={
                      dragState()?.active && dragState()?.photo.id === photo.id
                    }
                    onReorderPointerDown={(event) =>
                      handleReorderPointerDown(photo, event)
                    }
                    onSelect={() => togglePhoto(photo.id)}
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
