import { createEffect, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import {
  CopyPlus,
  Download,
  Trash2,
} from "lucide-solid";
import type { CollectionNavigationItem } from "~/lib/collection-data";

interface GalleryActionsProps {
  isAdmin: boolean;
  collections: CollectionNavigationItem[];
  collectionsLoaded: boolean;
  currentCollectionId?: string;
  photoCount: number;
  selectedCount: number;
  busy: boolean;
  message?: { type: "success" | "error"; text: string };
  onSelectAll: () => void;
  onDownloadSelected: () => void;
  onAddToCollection: (collectionId: string) => void;
  onRemoveFromCollection: () => void;
}

export function GalleryActions(props: GalleryActionsProps) {
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
    <section class="relative mx-auto h-10 max-w-5xl text-left">
      <div
        class={`absolute inset-0 flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap px-1 transition-opacity duration-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          props.selectedCount === 0
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={props.selectedCount > 0}
      >
        <span class="shrink-0">collections:</span>
        <Show
          when={props.collectionsLoaded && props.collections.length > 0}
        >
          <For each={props.collections}>
            {(collection) => (
              <A
                href={`/${collection.id}`}
                class={`shrink-0 underline hover:text-violet-300 ${
                  props.currentCollectionId === collection.id
                    ? "font-medium text-violet-200"
                    : "text-violet-400"
                }`}
              >
                {collection.name}
              </A>
            )}
          </For>
        </Show>
      </div>

      <div
        class={`absolute inset-0 flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap px-1 transition-opacity duration-150 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          props.selectedCount > 0
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        aria-hidden={props.selectedCount === 0}
      >
        <button
          onClick={props.onSelectAll}
          disabled={props.photoCount === 0}
          class="shrink-0 rounded-md px-2 py-1.5 text-sm text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          {props.selectedCount === props.photoCount && props.photoCount > 0
            ? "Deselect all"
            : "Select all"}
        </button>
        <span class="shrink-0 text-center text-xs text-zinc-500">
          {props.selectedCount} selected
        </span>
        <button
          onClick={props.onDownloadSelected}
          disabled={props.busy}
          class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-violet-300 hover:bg-zinc-800 disabled:opacity-40"
        >
          <Download class="h-4 w-4" />
          Download
        </button>

        <Show when={props.isAdmin}>
          <select
            value={targetCollectionId()}
            onChange={(event) =>
              setTargetCollectionId(event.currentTarget.value)
            }
            class="max-w-40 shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-violet-100 focus:border-violet-500 focus:outline-none"
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
            class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-sky-300 hover:bg-sky-500/15 disabled:opacity-40"
          >
            <CopyPlus class="h-4 w-4" />
            Add
          </button>
          <button
            onClick={props.onRemoveFromCollection}
            disabled={props.busy || !props.currentCollectionId}
            class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-red-300 hover:bg-red-500/15 disabled:opacity-40"
          >
            <Trash2 class="h-4 w-4" />
            Remove
          </button>
        </Show>
      </div>

      <Show when={props.message}>
        {(message) => (
          <div
            class={`pointer-events-none fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/95 px-4 py-2 text-center text-xs shadow-xl backdrop-blur-sm ${
              message().type === "success" ? "text-green-400" : "text-red-400"
            }`}
          >
            {message().text}
          </div>
        )}
      </Show>
    </section>
  );
}
