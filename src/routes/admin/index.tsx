import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import {
  ArrowLeft,
  Eye,
  GripVertical,
  Images,
  Loader2,
  Lock,
  Pencil,
  Plus,
} from "lucide-solid";
import { CollectionModal } from "~/components/admin/CollectionModal";
import type { Collection } from "~/db/schema";
import { getStoredAuthKey, isAuthenticated } from "~/lib/auth";

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = createSignal(false);
  const [collections, setCollections] = createSignal<Collection[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const [collectionModal, setCollectionModal] = createSignal<
    "new" | Collection | null
  >(null);

  onMount(() => {
    const authenticated = isAuthenticated();
    setIsAuthed(authenticated);
    if (authenticated) void loadCollections();
    else setLoading(false);
  });

  async function loadCollections() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/collections", {
        headers: { "X-Auth-Key": getStoredAuthKey() || "" },
      });
      if (!response.ok) throw new Error("Could not load galleries");
      setCollections(await response.json());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load galleries",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleModalSave() {
    setCollectionModal(null);
    void loadCollections();
  }

  return (
    <main class="min-h-screen bg-zinc-950 px-4 py-8 font-mono text-violet-200 sm:px-6">
      <div class="mx-auto max-w-5xl">
        <header class="mb-8 flex items-center justify-between gap-4">
          <div class="flex min-w-0 items-center gap-3">
            <A
              href="/"
              class="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-violet-200"
              aria-label="Back to gallery"
            >
              <ArrowLeft class="h-5 w-5" />
            </A>
            <div class="min-w-0">
              <h1 class="flex items-center gap-2 text-xl font-medium text-violet-100 sm:text-2xl">
                <Images class="h-5 w-5" />
                All galleries
              </h1>
              <p class="mt-1 text-xs text-zinc-500 sm:text-sm">
                Create, edit, open, and reorder every collection.
              </p>
            </div>
          </div>

          <Show when={isAuthed()}>
            <button
              onClick={() => setCollectionModal("new")}
              class="flex shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
            >
              <Plus class="h-4 w-4" />
              <span class="hidden sm:inline">New gallery</span>
              <span class="sm:hidden">New</span>
            </button>
          </Show>
        </header>

        <Show
          when={isAuthed()}
          fallback={
            <section class="rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-16 text-center">
              <Lock class="mx-auto mb-4 h-8 w-8 text-zinc-600" />
              <p class="mb-5 text-zinc-400">
                Log in to manage your galleries.
              </p>
              <A
                href="/login"
                class="inline-flex rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500"
              >
                Log in
              </A>
            </section>
          }
        >
          <Show
            when={!loading()}
            fallback={
              <div class="flex min-h-64 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40">
                <Loader2 class="h-6 w-6 animate-spin text-violet-500" />
              </div>
            }
          >
            <Show when={!error()} fallback={<ErrorState message={error()} />}>
              <Show
                when={collections().length > 0}
                fallback={
                  <section class="rounded-xl border border-dashed border-zinc-700 px-6 py-16 text-center text-zinc-500">
                    No galleries yet. Create your first one.
                  </section>
                }
              >
                <div class="grid gap-3">
                  <For each={collections()}>
                    {(collection) => (
                      <article class="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-center">
                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-2">
                            <h2 class="font-medium text-violet-100">
                              {collection.name}
                            </h2>
                            <code class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
                              /{collection.id}
                            </code>
                            <Show when={collection.isPrivate}>
                              <span class="inline-flex items-center gap-1 rounded-full bg-violet-950 px-2 py-0.5 text-xs text-violet-300">
                                <Lock class="h-3 w-3" />
                                Private
                              </span>
                            </Show>
                          </div>
                          <Show when={collection.description}>
                            <p class="mt-1 truncate text-sm text-zinc-500">
                              {collection.description}
                            </p>
                          </Show>
                        </div>

                        <div class="flex shrink-0 items-center gap-1 border-t border-zinc-800 pt-3 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                          <A
                            href={`/${collection.id}`}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-violet-200"
                          >
                            <Eye class="h-4 w-4" />
                            View
                          </A>
                          <A
                            href={`/${collection.id}?edit=1`}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-violet-200"
                          >
                            <GripVertical class="h-4 w-4" />
                            Edit photos
                          </A>
                          <button
                            onClick={() => setCollectionModal(collection)}
                            class="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-violet-200"
                          >
                            <Pencil class="h-4 w-4" />
                            Settings
                          </button>
                        </div>
                      </article>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </Show>
      </div>

      <Show when={collectionModal()}>
        {(modal) => (
          <CollectionModal
            collection={modal() === "new" ? undefined : modal()}
            onClose={() => setCollectionModal(null)}
            onSave={handleModalSave}
          />
        )}
      </Show>
    </main>
  );
}

function ErrorState(props: { message: string }) {
  return (
    <section class="rounded-xl border border-red-900/60 bg-red-950/20 px-6 py-12 text-center text-sm text-red-300">
      {props.message}
    </section>
  );
}
