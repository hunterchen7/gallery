import { createEffect, createSignal, For, Show } from "solid-js";
import {
  CheckSquare,
  CopyPlus,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Settings,
  Shuffle,
  Trash2,
  X,
} from "lucide-solid";
import type { Collection } from "~/db/schema";
import { CollectionModal } from "./CollectionModal";

export type GalleryEditMode = "select" | "reorder";

export interface EditableCollection {
  id: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
}

interface AdminGalleryOverlayProps {
  collections: Collection[];
  currentCollection?: EditableCollection;
  currentCollectionId?: string;
  mode: GalleryEditMode;
  photoCount: number;
  selectedCount: number;
  orderChanged: boolean;
  busy: boolean;
  message?: { type: "success" | "error"; text: string };
  onExit: () => void;
  onModeChange: (mode: GalleryEditMode) => void;
  onSelectAll: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void;
  onSaveOrder: () => void;
  onShuffle: () => void;
}

export function AdminGalleryOverlay(props: AdminGalleryOverlayProps) {
  const [targetCollectionId, setTargetCollectionId] = createSignal("");
  const [collectionModal, setCollectionModal] = createSignal<
    "new" | "edit" | null
  >(null);

  const targetCollections = () =>
    props.collections.filter(
      (collection) => collection.id !== props.currentCollectionId,
    );

  createEffect(() => {
    const targets = targetCollections();
    if (!targets.some((collection) => collection.id === targetCollectionId())) {
      setTargetCollectionId(targets[0]?.id || "");
    }
  });

  function handleCollectionChange(collectionId: string) {
    if (collectionId && collectionId !== props.currentCollectionId) {
      const mode = props.mode === "reorder" ? "&mode=reorder" : "";
      window.location.href = `/${collectionId}?edit=1${mode}`;
    }
  }

  function handleCollectionSave() {
    setCollectionModal(null);
    window.location.reload();
  }

  return (
    <>
      <div class="fixed left-1/2 top-3 z-40 w-[calc(100vw-1rem)] max-w-6xl -translate-x-1/2 rounded-xl border border-violet-700/70 bg-zinc-950/95 p-3 text-left shadow-2xl backdrop-blur-xl">
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-2 border-r border-zinc-800 pr-2">
            <span class="hidden items-center gap-2 text-sm font-medium text-violet-200 sm:flex">
              <Pencil class="h-4 w-4" />
              Edit gallery
            </span>
            <select
              value={props.currentCollectionId || ""}
              onChange={(event) => handleCollectionChange(event.currentTarget.value)}
              class="max-w-48 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-sm text-violet-100 focus:border-violet-500 focus:outline-none"
              aria-label="Current collection"
            >
              <For each={props.collections}>
                {(collection) => (
                  <option value={collection.id}>{collection.name}</option>
                )}
              </For>
            </select>
            <button
              onClick={() => setCollectionModal("new")}
              class="rounded-lg p-2 text-violet-300 hover:bg-zinc-800"
              title="New collection"
            >
              <Plus class="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollectionModal("edit")}
              disabled={!props.currentCollection}
              class="rounded-lg p-2 text-violet-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              title="Collection settings"
            >
              <Settings class="h-4 w-4" />
            </button>
          </div>

          <div class="flex rounded-lg bg-zinc-900 p-1">
            <button
              onClick={() => props.onModeChange("select")}
              class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                props.mode === "select"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-violet-200"
              }`}
            >
              <CheckSquare class="h-4 w-4" />
              Select
            </button>
            <button
              onClick={() => props.onModeChange("reorder")}
              class={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                props.mode === "reorder"
                  ? "bg-violet-600 text-white"
                  : "text-zinc-400 hover:text-violet-200"
              }`}
            >
              <GripVertical class="h-4 w-4" />
              Reorder
            </button>
          </div>

          <Show when={props.mode === "select"}>
            <button
              onClick={props.onSelectAll}
              disabled={props.photoCount === 0}
              class="rounded-lg px-3 py-2 text-sm text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              {props.selectedCount === props.photoCount && props.photoCount > 0
                ? "Deselect all"
                : "Select all"}
            </button>
            <Show when={props.selectedCount > 0}>
              <span class="text-sm text-zinc-400">
                {props.selectedCount} selected
              </span>
              <select
                value={targetCollectionId()}
                onChange={(event) =>
                  setTargetCollectionId(event.currentTarget.value)
                }
                class="max-w-44 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-violet-100 focus:border-violet-500 focus:outline-none"
                aria-label="Add selected photos to collection"
              >
                <For each={targetCollections()}>
                  {(collection) => (
                    <option value={collection.id}>{collection.name}</option>
                  )}
                </For>
              </select>
              <button
                onClick={() => props.onAddToCollection(targetCollectionId())}
                disabled={props.busy || !targetCollectionId()}
                class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/15 disabled:opacity-40"
              >
                <CopyPlus class="h-4 w-4" />
                Add
              </button>
              <button
                onClick={props.onRemoveFromCollection}
                disabled={props.busy || !props.currentCollectionId}
                class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-red-500/15 disabled:opacity-40"
              >
                <Trash2 class="h-4 w-4" />
                Remove
              </button>
            </Show>
          </Show>

          <Show when={props.mode === "reorder"}>
            <button
              onClick={props.onShuffle}
              disabled={props.busy || props.photoCount < 2}
              class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
            >
              <Shuffle class="h-4 w-4" />
              Shuffle
            </button>
            <button
              onClick={props.onSaveOrder}
              disabled={props.busy || !props.orderChanged}
              class="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              <Show when={props.busy} fallback={<Save class="h-4 w-4" />}>
                <Loader2 class="h-4 w-4 animate-spin" />
              </Show>
              {props.orderChanged ? "Save order" : "Order saved"}
            </button>
          </Show>

          <button
            onClick={props.onExit}
            class="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <X class="h-4 w-4" />
            Done
          </button>
        </div>

        <Show when={props.message}>
          {(message) => (
            <div
              class={`mt-2 rounded-lg px-3 py-2 text-xs ${
                message().type === "success"
                  ? "bg-green-500/10 text-green-300"
                  : "bg-red-500/10 text-red-300"
              }`}
            >
              {message().text}
            </div>
          )}
        </Show>
      </div>

      <Show when={collectionModal() === "new"}>
        <CollectionModal
          onClose={() => setCollectionModal(null)}
          onSave={handleCollectionSave}
        />
      </Show>
      <Show when={collectionModal() === "edit" && props.currentCollection}>
        <CollectionModal
          collection={props.currentCollection}
          onClose={() => setCollectionModal(null)}
          onSave={handleCollectionSave}
        />
      </Show>
    </>
  );
}
