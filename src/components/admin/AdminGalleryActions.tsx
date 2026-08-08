import { createEffect, createSignal, For, Show } from "solid-js";
import { CopyPlus, Redo2, Trash2, Undo2 } from "lucide-solid";
import type { Collection } from "~/db/schema";

interface AdminGalleryActionsProps {
  collections: Collection[];
  currentCollectionId?: string;
  photoCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  message?: { type: "success" | "error"; text: string };
  onSelectAll: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function AdminGalleryActions(props: AdminGalleryActionsProps) {
  const [targetCollectionId, setTargetCollectionId] = createSignal("");
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

  return (
    <section class="mx-auto mt-5 max-w-5xl text-left">
      <div class="flex h-11 items-center gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          onClick={props.onSelectAll}
          disabled={props.photoCount === 0}
          class="shrink-0 rounded-lg px-2.5 py-2 text-sm text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          {props.selectedCount === props.photoCount && props.photoCount > 0
            ? "Deselect all"
            : "Select all"}
        </button>
        <Show when={props.selectedCount > 0}>
          <span class="w-20 shrink-0 text-center text-xs text-zinc-500">
            {props.selectedCount} selected
          </span>
          <select
            value={targetCollectionId()}
            onChange={(event) =>
              setTargetCollectionId(event.currentTarget.value)
            }
            class="max-w-40 shrink-0 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-sm text-violet-100 focus:border-violet-500 focus:outline-none"
            aria-label="Target gallery"
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
            class="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-sky-300 hover:bg-sky-500/15 disabled:opacity-40"
          >
            <CopyPlus class="h-4 w-4" />
            Add
          </button>
          <button
            onClick={props.onRemoveFromCollection}
            disabled={props.busy || !props.currentCollectionId}
            class="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-red-300 hover:bg-red-500/15 disabled:opacity-40"
          >
            <Trash2 class="h-4 w-4" />
            Remove
          </button>
        </Show>

        <div class="ml-auto flex shrink-0 items-center gap-1">
          <button
            onClick={props.onUndo}
            disabled={props.busy || !props.canUndo}
            class="rounded-lg p-2 text-violet-300 hover:bg-zinc-800 disabled:text-zinc-700 disabled:hover:bg-transparent"
            title="Undo (⌘/Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 class="h-4 w-4" />
          </button>
          <button
            onClick={props.onRedo}
            disabled={props.busy || !props.canRedo}
            class="rounded-lg p-2 text-violet-300 hover:bg-zinc-800 disabled:text-zinc-700 disabled:hover:bg-transparent"
            title="Redo (⌘/Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="min-h-5 px-2 pt-1 text-center text-xs">
        <Show when={props.message}>
          {(message) => (
            <span
              class={
                message().type === "success" ? "text-green-400" : "text-red-400"
              }
            >
              {message().text}
            </span>
          )}
        </Show>
      </div>
    </section>
  );
}
