import { createSignal, Show } from "solid-js";
import { X, Loader2 } from "lucide-solid";
import { getStoredAuthKey } from "~/lib/auth";
import type { Collection } from "~/db/schema";

interface CollectionModalProps {
  collection?: Collection; // If provided, we're editing; otherwise creating
  onClose: () => void;
  onSave: () => void;
}

export function CollectionModal(props: CollectionModalProps) {
  const isEditing = () => !!props.collection;

  const [id, setId] = createSignal(props.collection?.id || "");
  const [name, setName] = createSignal(props.collection?.name || "");
  const [description, setDescription] = createSignal(
    props.collection?.description || "",
  );
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  // Auto-generate id from name when creating
  function handleNameChange(value: string) {
    setName(value);
    if (!isEditing()) {
      // Generate URL-safe slug from name
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setId(slug);
    }
  }

  async function handleSubmit() {
    setError("");

    if (!id() || !name()) {
      setError("ID and name are required");
      return;
    }

    if (!/^[a-z0-9-]+$/.test(id())) {
      setError("ID must be lowercase alphanumeric with hyphens only");
      return;
    }

    setLoading(true);
    const authKey = getStoredAuthKey();

    try {
      const url = isEditing()
        ? `/api/collections/${props.collection!.id}`
        : "/api/collections";
      const method = isEditing() ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Key": authKey || "",
        },
        body: JSON.stringify({
          id: id(),
          name: name(),
          description: description() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save collection");
      }

      props.onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!props.collection) return;
    if (!confirm(`Delete collection "${props.collection.name}"?`)) return;

    setLoading(true);
    const authKey = getStoredAuthKey();

    try {
      const res = await fetch(`/api/collections/${props.collection.id}`, {
        method: "DELETE",
        headers: {
          "X-Auth-Key": authKey || "",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete collection");
      }

      props.onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setLoading(false);
    }
  }

  return (
    <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm">
      <div class="bg-zinc-900 border border-violet-800 rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-xl font-medium text-violet-200">
            {isEditing() ? "Edit Collection" : "New Collection"}
          </h2>
          <button onClick={props.onClose} class="p-1 hover:bg-zinc-800 rounded">
            <X class="w-5 h-5 text-violet-400" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
          class="space-y-4"
        >
          <div>
            <label class="block text-sm text-violet-400 mb-1">Name</label>
            <input
              type="text"
              value={name()}
              onInput={(e) => handleNameChange(e.currentTarget.value)}
              placeholder="e.g., Airshow ✈️"
              class="w-full px-4 py-2 bg-zinc-800 border border-violet-700 rounded text-violet-100 placeholder-violet-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <div>
            <label class="block text-sm text-violet-400 mb-1">
              ID (URL path)
            </label>
            <input
              type="text"
              value={id()}
              onInput={(e) => setId(e.currentTarget.value)}
              placeholder="e.g., airshow"
              disabled={isEditing()}
              class="w-full px-4 py-2 bg-zinc-800 border border-violet-700 rounded text-violet-100 placeholder-violet-500 focus:outline-none focus:border-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p class="text-xs text-zinc-500 mt-1">
              This will be the URL: /{id() || "your-collection"}
            </p>
          </div>

          <div>
            <label class="block text-sm text-violet-400 mb-1">
              Description (optional)
            </label>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="A brief description of this collection..."
              rows={3}
              class="w-full px-4 py-2 bg-zinc-800 border border-violet-700 rounded text-violet-100 placeholder-violet-500 focus:outline-none focus:border-violet-500 resize-none"
            />
          </div>

          <Show when={error()}>
            <p class="text-red-400 text-sm">{error()}</p>
          </Show>

          <div class="flex justify-between pt-2">
            <Show when={isEditing()}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading()}
                class="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
              >
                Delete
              </button>
            </Show>
            <div class="flex gap-3 ml-auto">
              <button
                type="button"
                onClick={props.onClose}
                class="px-4 py-2 text-violet-300 hover:text-violet-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading()}
                class="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 disabled:cursor-not-allowed rounded text-white font-medium transition-colors flex items-center gap-2"
              >
                <Show when={loading()}>
                  <Loader2 class="w-4 h-4 animate-spin" />
                </Show>
                {loading() ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
