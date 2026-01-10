import { createSignal, For, Show, onMount } from "solid-js";
import { Plus, Edit, ArrowLeft, Loader2, GripVertical } from "lucide-solid";
import { isAuthenticated, getStoredAuthKey } from "~/lib/auth";
import { CollectionModal } from "~/components/admin/CollectionModal";
import { AdminToggle } from "~/components/admin/AdminToggle";
import type { Collection } from "~/db/schema";

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = createSignal(false);
  const [collections, setCollections] = createSignal<Collection[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [showModal, setShowModal] = createSignal(false);
  const [editingCollection, setEditingCollection] = createSignal<
    Collection | undefined
  >();

  onMount(async () => {
    setIsAuthed(isAuthenticated());

    // Fetch collections client-side only
    try {
      const res = await fetch("/api/collections");
      if (res.ok) {
        const data = await res.json();
        setCollections(data);
      }
    } catch (e) {
      console.error("Failed to fetch collections:", e);
    }
    setLoading(false);
  });

  function handleAdminModeChange(enabled: boolean) {
    setIsAuthed(enabled);
  }

  function refetch() {
    setLoading(true);
    fetch("/api/collections")
      .then((res) => res.json())
      .then((data) => setCollections(data))
      .catch((e) => console.error("Failed to fetch collections:", e))
      .finally(() => setLoading(false));
  }

  function openNewModal() {
    setEditingCollection(undefined);
    setShowModal(true);
  }

  function openEditModal(collection: Collection) {
    setEditingCollection(collection);
    setShowModal(true);
  }

  function handleModalSave() {
    setShowModal(false);
    setEditingCollection(undefined);
    refetch();
  }

  return (
    <main class="min-h-screen bg-zinc-950 text-violet-200 font-mono">
      <AdminToggle onAdminModeChange={handleAdminModeChange} />

      <div class="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-4">
            <a
              href="/"
              class="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <ArrowLeft class="w-5 h-5" />
            </a>
            <h1 class="text-2xl font-thin">Admin</h1>
          </div>
        </div>

        <Show
          when={isAuthed()}
          fallback={
            <div class="text-center py-20">
              <p class="text-zinc-500 mb-4">
                Please log in to access admin features.
              </p>
              <p class="text-sm text-zinc-600">
                Use the key icon in the bottom-right corner.
              </p>
            </div>
          }
        >
          {/* Collections section */}
          <section>
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg text-violet-400">Collections</h2>
              <button
                onClick={openNewModal}
                class="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded text-sm font-medium transition-colors"
              >
                <Plus class="w-4 h-4" />
                New Collection
              </button>
            </div>

            <Show
              when={!loading()}
              fallback={
                <div class="flex justify-center py-8">
                  <Loader2 class="w-6 h-6 animate-spin text-violet-500" />
                </div>
              }
            >
              <Show
                when={collections().length}
                fallback={
                  <div class="text-center py-8 text-zinc-500">
                    No collections yet. Create your first one!
                  </div>
                }
              >
                <div class="space-y-2">
                  <For each={collections()}>
                    {(collection) => (
                      <div class="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-violet-800 transition-colors">
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <span class="font-medium">{collection.name}</span>
                            <span class="text-xs text-zinc-500">
                              /{collection.id}
                            </span>
                          </div>
                          <Show when={collection.description}>
                            <p class="text-sm text-zinc-400 mt-1 truncate">
                              {collection.description}
                            </p>
                          </Show>
                        </div>
                        <div class="flex items-center gap-2">
                          <a
                            href={`/${collection.id}`}
                            class="px-3 py-1 text-sm text-violet-400 hover:text-violet-300 hover:bg-zinc-800 rounded transition-colors"
                          >
                            View
                          </a>
                          <a
                            href={`/admin/${collection.id}/reorder`}
                            class="p-2 hover:bg-zinc-800 rounded transition-colors"
                            title="Reorder photos"
                          >
                            <GripVertical class="w-4 h-4 text-violet-400" />
                          </a>
                          <button
                            onClick={() => openEditModal(collection)}
                            class="p-2 hover:bg-zinc-800 rounded transition-colors"
                          >
                            <Edit class="w-4 h-4 text-violet-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Show>
          </section>

          {/* Help section */}
          <section class="mt-12 p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <h3 class="text-sm font-medium text-violet-400 mb-2">Quick Tips</h3>
            <ul class="text-sm text-zinc-400 space-y-1">
              <li>
                • Use the <strong>Upload</strong> button (bottom-left on gallery
                pages) to add photos
              </li>
              <li>• Collection IDs become the URL path (e.g., /airshow)</li>
              <li>• Photos can belong to multiple collections</li>
              <li>
                • Deleting a collection removes photos from that collection only
              </li>
            </ul>
          </section>
        </Show>
      </div>

      {/* Modal */}
      <Show when={showModal()}>
        <CollectionModal
          collection={editingCollection()}
          onClose={() => setShowModal(false)}
          onSave={handleModalSave}
        />
      </Show>
    </main>
  );
}
