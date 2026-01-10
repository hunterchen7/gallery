import { createSignal, For, Show, onMount } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import {
  ArrowLeft,
  GripVertical,
  Save,
  Loader2,
  Shuffle,
  Trash2,
  X,
  Check,
} from "lucide-solid";
import { isAuthenticated, getStoredAuthKey } from "~/lib/auth";
import { S3_PREFIX } from "~/types/photo";

interface PhotoItem {
  id: string;
  url: string;
  thumbnail: string;
  date: string;
  order: number;
}

interface CollectionWithPhotos {
  id: string;
  name: string;
  description: string | null;
  photos: PhotoItem[];
}

// Seeded random for consistent shuffling
function seededRandom(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 2 ** 32;
  };
}

function shuffleArray<T>(array: T[], seed?: number): T[] {
  const arr = [...array];
  const rand = seed !== undefined ? seededRandom(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function fetchCollection(id: string): Promise<CollectionWithPhotos> {
  const res = await fetch(`/api/collections/${id}`);
  if (!res.ok) throw new Error("Failed to fetch collection");
  return res.json();
}

export default function ReorderPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [isAuthed, setIsAuthed] = createSignal(false);
  const [loading, setLoading] = createSignal(true);
  const [collection, setCollection] = createSignal<CollectionWithPhotos | null>(
    null,
  );
  const [photos, setPhotos] = createSignal<PhotoItem[]>([]);
  const [originalPhotos, setOriginalPhotos] = createSignal<PhotoItem[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = createSignal<Set<string>>(
    new Set(),
  );
  const [saving, setSaving] = createSignal(false);
  const [draggedIndex, setDraggedIndex] = createSignal<number | null>(null);
  const [selectedPhotos, setSelectedPhotos] = createSignal<Set<string>>(
    new Set(),
  );
  const [selectionMode, setSelectionMode] = createSignal(false);

  // Computed: has changes
  const hasChanges = () => {
    if (removedPhotoIds().size > 0) return true;
    const current = photos();
    const original = originalPhotos();
    if (current.length !== original.length) return true;
    return current.some((p, i) => p.id !== original[i]?.id);
  };

  onMount(async () => {
    setIsAuthed(isAuthenticated());
    try {
      const data = await fetchCollection(params.id!);
      setCollection(data);
      setPhotos([...data.photos]);
      setOriginalPhotos([...data.photos]);
    } catch (e) {
      console.error("Failed to load collection:", e);
    }
    setLoading(false);
  });

  function handleDragStart(index: number) {
    if (selectionMode()) return;
    setDraggedIndex(index);
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (selectionMode()) return;
    const dragged = draggedIndex();
    if (dragged === null || dragged === index) return;

    const newPhotos = [...photos()];
    const [draggedItem] = newPhotos.splice(dragged, 1);
    newPhotos.splice(index, 0, draggedItem);
    setPhotos(newPhotos);
    setDraggedIndex(index);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
  }

  function handlePhotoClick(photoId: string) {
    if (!selectionMode()) return;

    const selected = new Set(selectedPhotos());
    if (selected.has(photoId)) {
      selected.delete(photoId);
    } else {
      selected.add(photoId);
    }
    setSelectedPhotos(selected);
  }

  function handleShuffle() {
    const seed = Date.now();
    setPhotos(shuffleArray(photos(), seed));
  }

  function handleRemoveSelected() {
    const selected = selectedPhotos();
    if (selected.size === 0) return;

    // Add to removed set
    const removed = new Set(removedPhotoIds());
    selected.forEach((id) => removed.add(id));
    setRemovedPhotoIds(removed);

    // Remove from photos list
    setPhotos(photos().filter((p) => !selected.has(p.id)));

    // Clear selection
    setSelectedPhotos(new Set<string>());
    setSelectionMode(false);
  }

  function handleSelectAll() {
    if (selectedPhotos().size === photos().length) {
      setSelectedPhotos(new Set<string>());
    } else {
      setSelectedPhotos(new Set(photos().map((p) => p.id)));
    }
  }

  function handleCancelSelection() {
    setSelectedPhotos(new Set<string>());
    setSelectionMode(false);
  }

  function handleReset() {
    setPhotos([...originalPhotos()]);
    setRemovedPhotoIds(new Set<string>());
    setSelectedPhotos(new Set<string>());
    setSelectionMode(false);
  }

  async function handleSave() {
    if (!isAuthed() || !hasChanges()) return;

    setSaving(true);
    try {
      // First, remove photos from collection if any
      const removed = removedPhotoIds();
      if (removed.size > 0) {
        for (const photoId of removed) {
          await fetch(`/api/photos/${photoId}/collections/${params.id}`, {
            method: "DELETE",
            headers: {
              "X-Auth-Key": getStoredAuthKey() || "",
            },
          });
        }
      }

      // Then, save the new order
      const photoIds = photos().map((p) => p.id);
      const res = await fetch(`/api/collections/${params.id}/reorder`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": getStoredAuthKey() || "",
        },
        body: JSON.stringify({ photoIds }),
      });

      if (res.ok) {
        // Update original to match current
        setOriginalPhotos([...photos()]);
        setRemovedPhotoIds(new Set<string>());
      } else {
        console.error("Failed to save order");
      }
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="min-h-screen bg-zinc-950 text-violet-200 font-mono">
      <div class="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div class="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div class="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin")}
              class="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ArrowLeft class="w-5 h-5" />
            </button>
            <div>
              <h1 class="text-2xl font-thin">Edit Collection</h1>
              <Show when={collection()}>
                <p class="text-sm text-zinc-500">{collection()!.name}</p>
              </Show>
            </div>
          </div>

          <Show when={isAuthed()}>
            <div class="flex items-center gap-2">
              <Show when={hasChanges()}>
                <button
                  onClick={handleReset}
                  class="flex items-center gap-2 px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                >
                  <X class="w-4 h-4" />
                  Reset
                </button>
              </Show>
              <button
                onClick={handleSave}
                disabled={!hasChanges() || saving()}
                class="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded font-medium transition-colors"
              >
                <Show when={saving()} fallback={<Save class="w-4 h-4" />}>
                  <Loader2 class="w-4 h-4 animate-spin" />
                </Show>
                {saving()
                  ? "Saving..."
                  : hasChanges()
                    ? "Save Changes"
                    : "Saved"}
              </button>
            </div>
          </Show>
        </div>

        <Show
          when={isAuthed()}
          fallback={
            <div class="text-center py-20">
              <p class="text-zinc-500 mb-4">
                Please log in to edit this collection.
              </p>
              <a href="/login" class="text-violet-400 underline">
                Go to login
              </a>
            </div>
          }
        >
          <Show
            when={!loading()}
            fallback={
              <div class="flex justify-center py-20">
                <Loader2 class="w-8 h-8 animate-spin text-violet-500" />
              </div>
            }
          >
            {/* Toolbar */}
            <div class="flex items-center justify-between mb-4 p-3 bg-zinc-900 rounded-lg">
              <div class="flex items-center gap-2">
                <Show
                  when={selectionMode()}
                  fallback={
                    <button
                      onClick={() => setSelectionMode(true)}
                      class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 rounded transition-colors"
                    >
                      <Check class="w-4 h-4" />
                      Select
                    </button>
                  }
                >
                  <button
                    onClick={handleCancelSelection}
                    class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 rounded transition-colors"
                  >
                    <X class="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSelectAll}
                    class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 rounded transition-colors"
                  >
                    {selectedPhotos().size === photos().length
                      ? "Deselect All"
                      : "Select All"}
                  </button>
                  <Show when={selectedPhotos().size > 0}>
                    <span class="text-zinc-500 text-sm px-2">
                      {selectedPhotos().size} selected
                    </span>
                  </Show>
                </Show>
              </div>

              <div class="flex items-center gap-2">
                <Show when={selectionMode() && selectedPhotos().size > 0}>
                  <button
                    onClick={handleRemoveSelected}
                    class="flex items-center gap-2 px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 rounded transition-colors"
                  >
                    <Trash2 class="w-4 h-4" />
                    Remove from collection
                  </button>
                </Show>
                <Show when={!selectionMode()}>
                  <button
                    onClick={handleShuffle}
                    class="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 rounded transition-colors"
                  >
                    <Shuffle class="w-4 h-4" />
                    Shuffle
                  </button>
                </Show>
              </div>
            </div>

            <p class="text-sm text-zinc-500 mb-4">
              <Show when={selectionMode()}>
                Click photos to select them, then remove from collection.
              </Show>
              <Show when={!selectionMode()}>
                Drag to reorder • Click "Select" to remove photos • Changes save
                when you click "Save Changes"
              </Show>
            </p>

            <Show when={removedPhotoIds().size > 0}>
              <div class="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
                {removedPhotoIds().size} photo(s) will be removed from this
                collection when you save.
              </div>
            </Show>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              <For each={photos()}>
                {(photo, index) => (
                  <div
                    draggable={!selectionMode()}
                    onDragStart={() => handleDragStart(index())}
                    onDragOver={(e) => handleDragOver(e, index())}
                    onDragEnd={handleDragEnd}
                    onClick={() => handlePhotoClick(photo.id)}
                    class={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      selectionMode() ? "cursor-pointer" : "cursor-move"
                    } ${
                      draggedIndex() === index()
                        ? "border-violet-500 opacity-50"
                        : selectedPhotos().has(photo.id)
                          ? "border-violet-500 ring-2 ring-violet-500/50"
                          : "border-transparent hover:border-violet-700"
                    }`}
                  >
                    <img
                      src={`${S3_PREFIX}${photo.thumbnail}`}
                      alt=""
                      class="w-full aspect-square object-cover"
                      draggable={false}
                    />

                    {/* Selection indicator */}
                    <Show when={selectionMode()}>
                      <div
                        class={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selectedPhotos().has(photo.id)
                            ? "bg-violet-500 border-violet-500"
                            : "bg-black/50 border-white/50"
                        }`}
                      >
                        <Show when={selectedPhotos().has(photo.id)}>
                          <Check class="w-4 h-4 text-white" />
                        </Show>
                      </div>
                    </Show>

                    {/* Drag indicator */}
                    <Show when={!selectionMode()}>
                      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <GripVertical class="w-8 h-8 text-white" />
                      </div>
                    </Show>

                    {/* Order number */}
                    <div class="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {index() + 1}
                    </div>
                  </div>
                )}
              </For>
            </div>

            <Show when={photos().length === 0}>
              <div class="text-center py-20 text-zinc-500">
                No photos in this collection.
              </div>
            </Show>
          </Show>
        </Show>
      </div>
    </main>
  );
}
